import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';
import { migrationsFolder } from '../src/app/services.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import { SessionVault, type SessionFileStore } from '../src/security/session-vault.js';
import type { DataPaths } from '../src/platform/types.js';

let tempDir: string;
let database: SqliteDatabase;
let manager: AccountManager;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-accounts-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  manager = new AccountManager(database);
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe('AccountManager', () => {
  it('adds an account and gives it an id', () => {
    const account = manager.add({ provider: 'mock', label: 'student-one' });

    expect(account.id).toBeGreaterThan(0);
    expect(account.provider).toBe('mock');
    expect(account.label).toBe('student-one');
    expect(account.state).toBe('needs_login');
  });

  it('lists two accounts', () => {
    manager.add({ provider: 'mock', label: 'student-one' });
    manager.add({ provider: 'mock', label: 'student-two' });

    const accounts = manager.list();

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.label)).toEqual(['student-one', 'student-two']);
  });

  it('removes an account', () => {
    const account = manager.add({ provider: 'mock', label: 'student-one' });

    expect(manager.remove(account.id)).toBe(true);
    expect(manager.list()).toHaveLength(0);
    expect(manager.remove(account.id)).toBe(false);
  });

  it('finds an account by provider and label', () => {
    manager.add({ provider: 'mock', label: 'student-one' });

    const found = manager.find('mock', 'student-one');

    expect(found?.label).toBe('student-one');
    expect(manager.find('mock', 'missing')).toBeUndefined();
  });

  it('rejects a duplicate account', () => {
    manager.add({ provider: 'mock', label: 'student-one' });

    expect(() => manager.add({ provider: 'mock', label: 'student-one' })).toThrow(/already exists/);
  });

  it('rejects an empty provider or label', () => {
    expect(() => manager.add({ provider: '  ', label: 'student-one' })).toThrow(
      /provider name is empty/,
    );
    expect(() => manager.add({ provider: 'mock', label: '  ' })).toThrow(/label is empty/);
  });

  it('changes the state and the cooling down time', () => {
    const account = manager.add({ provider: 'mock', label: 'student-one' });
    const coolingUntil = new Date('2026-10-27T00:00:00.000Z');

    manager.setState(account.id, 'cooling_down', coolingUntil);

    const changed = manager.get(account.id);
    expect(changed?.state).toBe('cooling_down');
    expect(changed?.coolingUntil).toEqual(coolingUntil);
  });
});

class MemoryFileStore implements SessionFileStore {
  readonly files = new Set<string>();

  async read(filePath: string): Promise<Buffer> {
    if (!this.files.has(filePath)) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }

    return Buffer.from('state');
  }

  async write(filePath: string): Promise<void> {
    this.files.add(filePath);
  }

  async delete(filePath: string): Promise<void> {
    this.files.delete(filePath);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }
}

function makeDataPaths(): DataPaths {
  const sessionsFolder = path.join(tempDir, 'sessions');
  const keysFolder = path.join(tempDir, 'keys');
  const logsFolder = path.join(tempDir, 'logs');

  return {
    dataFolder: tempDir,
    configFile: path.join(tempDir, 'config.json'),
    databaseFile: path.join(tempDir, 'gauntlet.db'),
    sessionsFolder,
    keysFolder,
    logsFolder,
    keyFile: path.join(keysFolder, 'key.bin'),
    sessionFile: (accountId) => path.join(sessionsFolder, `${accountId}.enc`),
    logFile: (name) => path.join(logsFolder, `${name}.log`),
  };
}

describe('logout', () => {
  it('deletes the session file and the account', async () => {
    const dataPaths = makeDataPaths();
    const fileStore = new MemoryFileStore();
    const vault = new SessionVault({
      dataPaths,
      keyStore: new MemoryKeyStore(),
      fileStore,
    });

    const account = manager.add({ provider: 'mock', label: 'student-one' });
    await vault.save(account.id, { cookies: [] });
    expect(await vault.hasSession(account.id)).toBe(true);

    await vault.delete(account.id);
    manager.remove(account.id);

    expect(await vault.hasSession(account.id)).toBe(false);
    expect(manager.list()).toHaveLength(0);
  });
});

describe('accounts command', () => {
  it('lists the accounts with their state', async () => {
    const { setServicesFactory } = await import('../src/cli/commands/services.js');
    const accounts = new AccountManager(database);
    accounts.add({ provider: 'mock', label: 'student-one' });

    setServicesFactory(async () => ({
      database,
      accounts,
      vault: new SessionVault({
        dataPaths: makeDataPaths(),
        keyStore: new MemoryKeyStore(),
        fileStore: new MemoryFileStore(),
      }),
      registry: {
        get: () => undefined,
        has: () => false,
        names: () => [],
        register: () => undefined,
      } as never,
      close: () => undefined,
    }));

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createAccountsCommand } = await import('../src/cli/commands/accounts.js');
    await createAccountsCommand().parseAsync(['node', 'gauntlet']);

    expect(log).toHaveBeenCalledWith('mock student-one [needs login]');
  });
});
