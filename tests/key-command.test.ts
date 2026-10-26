import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrationsFolder, type Services } from '../src/app/services.js';
import { AccountManager } from '../src/accounts/account-manager.js';
import { setServicesFactory } from '../src/cli/commands/services.js';
import { CLASSIFIER_NOTICE, createKeyCommand } from '../src/cli/commands/key.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import { SecretStore } from '../src/security/secret-store.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

const API_KEY = 'gsk_test_0123456789abcdef';

let tempDir: string;
let database: SqliteDatabase;
let vault: SessionVault;
let lines: string[];

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-key-command-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  const dataPaths = {
    sessionFile: (id: string | number) => path.join(tempDir, 'sessions', `${String(id)}.enc`),
  } as DataPaths;
  vault = new SessionVault({ dataPaths, keyStore: new MemoryKeyStore() });
  lines = [];

  const services: Services = {
    database,
    accounts: new AccountManager(database),
    vault,
    registry: new AdapterRegistry(),
    close: () => undefined,
  };
  setServicesFactory(async () => services);
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

function run(args: string[], secret = API_KEY): Promise<unknown> {
  const prompts: string[] = [];
  return createKeyCommand({
    write: (text) => lines.push(text),
    readSecret: async (prompt) => {
      prompts.push(prompt);
      lines.push(`[prompt] ${prompt}`);
      return secret;
    },
  }).parseAsync(['node', 'key', ...args]);
}

describe('key command', () => {
  it('shows the notice before it asks for the key, then saves the key encrypted', async () => {
    await run(['set', 'groq']);

    expect(lines[0]).toBe(CLASSIFIER_NOTICE);
    expect(lines[1]).toContain('[prompt]');
    expect(await new SecretStore(vault).load('groq-key')).toBe(API_KEY);

    const file = await readFile(path.join(tempDir, 'sessions', 'secret-groq-key.enc'));
    expect(file.toString('latin1')).not.toContain(API_KEY);
  });

  it('never prints the key', async () => {
    await run(['set', 'openrouter']);

    expect(lines.join('\n')).not.toContain(API_KEY);
  });

  it('rejects an unknown provider before it shows the notice or asks for a key', async () => {
    await expect(run(['set', 'nope'])).rejects.toMatchObject({ code: 'USAGE' });

    expect(lines).toEqual([]);
  });

  it('rejects an empty key', async () => {
    await expect(run(['set', 'groq'], '')).rejects.toMatchObject({ code: 'SECRET_INVALID' });
    expect(await new SecretStore(vault).load('groq-key')).toBeUndefined();
  });

  it('removes a saved key', async () => {
    await run(['set', 'groq']);

    await run(['remove', 'groq']);

    expect(await new SecretStore(vault).load('groq-key')).toBeUndefined();
  });
});
