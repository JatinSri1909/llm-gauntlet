import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { logoutAccount, removeAccount } from '../src/accounts/logout.js';
import { migrationsFolder } from '../src/app/services.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';
import { UsageTracker } from '../src/usage/usage-tracker.js';

let tempDir: string;
let database: SqliteDatabase;
let accounts: AccountManager;
let vault: SessionVault;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-logout-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  accounts = new AccountManager(database);
  const dataPaths = {
    sessionFile: (id: string | number) => path.join(tempDir, 'sessions', `${String(id)}.enc`),
  } as DataPaths;
  vault = new SessionVault({ dataPaths, keyStore: new MemoryKeyStore() });
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe('logoutAccount', () => {
  it('signs out one account, keeps the row and its usage history', async () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });
    accounts.setState(account.id, 'ready');
    await vault.save(account.id, { cookies: [], origins: [] });
    new UsageTracker({ database, accounts, windowHours: 24 }).recordRequest(account.id, 'm', 10);

    const removed = await logoutAccount({ accounts, vault }, 'mock', 'student-one');

    expect(removed?.label).toBe('student-one');
    expect(accounts.get(account.id)?.state).toBe('needs_login');
    expect(await vault.hasSession(account.id)).toBe(false);
    expect(
      new UsageTracker({ database, accounts, windowHours: 24 }).totals(account.id).requests,
    ).toBe(1);
  });

  it('refuses to guess when the provider has two accounts and no label is given', async () => {
    accounts.add({ provider: 'mock', label: 'student-one' });
    accounts.add({ provider: 'mock', label: 'student-two' });

    await expect(logoutAccount({ accounts, vault }, 'mock', undefined)).rejects.toThrow(
      'The provider mock has 2 accounts.',
    );
  });
});

describe('removeAccount', () => {
  it('deletes the session file, the row, and the usage history', async () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });
    await vault.save(account.id, { cookies: [], origins: [] });
    new UsageTracker({ database, accounts, windowHours: 24 }).recordRequest(account.id, 'm', 10);

    const removed = await removeAccount({ accounts, vault }, 'Mock', 'student-one');

    expect(removed?.id).toBe(account.id);
    expect(accounts.get(account.id)).toBeUndefined();
    expect(await vault.hasSession(account.id)).toBe(false);
    expect(
      database.get<{ count: number }>('SELECT COUNT(*) AS count FROM usage_records')?.count,
    ).toBe(0);
  });

  it('removes only the named account and returns undefined for an unknown one', async () => {
    accounts.add({ provider: 'mock', label: 'student-one' });
    accounts.add({ provider: 'mock', label: 'student-two' });

    expect(await removeAccount({ accounts, vault }, 'mock', 'nobody')).toBeUndefined();
    await removeAccount({ accounts, vault }, 'mock', 'student-two');

    expect(accounts.list().map((account) => account.label)).toEqual(['student-one']);
  });

  it('refuses to guess when the provider has two accounts and no label is given', async () => {
    accounts.add({ provider: 'mock', label: 'student-one' });
    accounts.add({ provider: 'mock', label: 'student-two' });

    await expect(removeAccount({ accounts, vault }, 'mock', undefined)).rejects.toThrow(
      'The provider mock has 2 accounts.',
    );
    expect(accounts.list()).toHaveLength(2);
  });
});
