import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { migrationsFolder, type Services } from '../src/app/services.js';
import { runChat } from '../src/cli/commands/chat.js';
import { createDoctorCommand } from '../src/cli/commands/doctor.js';
import { setServicesFactory } from '../src/cli/commands/services.js';
import {
  checkBrowser,
  checkDataFolder,
  checkDatabase,
  checkKeyStore,
  checkNodeVersion,
  formatCheck,
  hasFailure,
  runChecks,
  type DoctorEnvironment,
} from '../src/doctor/checks.js';
import { createDoctorEnvironment } from '../src/doctor/environment.js';
import { parseConfig } from '../src/core/config.js';
import type { LineInput, LineReader } from '../src/interactive/shell.js';
import type { TerminalOutput } from '../src/interactive/render.js';
import { createWindowsPlatform } from '../src/platform/windows/index.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

/** A healthy environment. A test changes one part of it. */
function healthyEnvironment(overrides: Partial<DoctorEnvironment> = {}): DoctorEnvironment {
  return {
    nodeVersion: '24.1.0',
    dataFolder: 'C:/data',
    databaseFile: 'C:/data/gauntlet.db',
    keyStore: { hasKey: async () => true },
    folderIsWritable: async () => true,
    findBrowser: async () => 'C:/Edge/msedge.exe',
    checkDatabase: async () => undefined,
    ...overrides,
  };
}

describe('doctor checks', () => {
  it('passes Node.js 24 or newer and fails an older version', () => {
    expect(checkNodeVersion(healthyEnvironment()).status).toBe('pass');

    const old = checkNodeVersion(healthyEnvironment({ nodeVersion: '22.21.1' }));
    expect(old.status).toBe('fail');
    expect(old.hint).toBe('Install Node.js 24 or newer.');
  });

  it('passes when a browser is found and fails when none is', async () => {
    expect((await checkBrowser(healthyEnvironment())).status).toBe('pass');

    const missing = await checkBrowser(healthyEnvironment({ findBrowser: async () => undefined }));
    expect(missing.status).toBe('fail');
    expect(missing.hint).toContain('Microsoft Edge');
  });

  it('passes a writable data folder and fails one that cannot be written', async () => {
    expect((await checkDataFolder(healthyEnvironment())).status).toBe('pass');

    const locked = await checkDataFolder(
      healthyEnvironment({ folderIsWritable: async () => false }),
    );
    expect(locked.status).toBe('fail');
    expect(locked.message).toContain('cannot be written');
  });

  it('passes with or without a stored key, and fails when the key store cannot be read', async () => {
    const withKey = await checkKeyStore(healthyEnvironment());
    expect(withKey.status).toBe('pass');
    expect(withKey.message).toBe('the key is stored');

    const noKey = await checkKeyStore(
      healthyEnvironment({ keyStore: { hasKey: async () => false } }),
    );
    expect(noKey.status).toBe('pass');
    expect(noKey.message).toContain('made on the first use');

    const broken = await checkKeyStore(
      healthyEnvironment({
        keyStore: {
          hasKey: async () => {
            throw new Error('DPAPI failed');
          },
        },
      }),
    );
    expect(broken.status).toBe('fail');
    expect(broken.message).not.toContain('DPAPI');
  });

  it('passes when the database opens and fails with its error when it does not', async () => {
    expect((await checkDatabase(healthyEnvironment())).status).toBe('pass');

    const failing = await checkDatabase(
      healthyEnvironment({
        checkDatabase: async () => {
          throw new Error('database is locked');
        },
      }),
    );
    expect(failing.status).toBe('fail');
    expect(failing.message).toBe('database is locked');
  });
});

describe('runChecks', () => {
  it('runs five checks in order and reports a failure', async () => {
    const results = await runChecks(healthyEnvironment({ nodeVersion: '20.0.0' }));

    expect(results.map((result) => result.name)).toEqual([
      'Node.js',
      'Browser',
      'Data folder',
      'Key store',
      'Database',
    ]);
    expect(hasFailure(results)).toBe(true);
  });

  it('reports no failure when every check passes', async () => {
    expect(hasFailure(await runChecks(healthyEnvironment()))).toBe(false);
  });

  it('formats a failure with its hint on the next line', async () => {
    const [node] = await runChecks(healthyEnvironment({ nodeVersion: '20.0.0' }));
    if (node === undefined) {
      throw new Error('The Node.js check is missing.');
    }

    expect(formatCheck(node)).toBe(
      'FAIL Node.js: version 20.0.0 is too old\n     Install Node.js 24 or newer.',
    );
  });
});

describe('gauntlet doctor command', () => {
  it('prints each check and keeps the exit code at 0 when all pass', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await createDoctorCommand({ environment: () => healthyEnvironment() }).parseAsync([
      'node',
      'doctor',
    ]);

    expect(log).toHaveBeenCalledTimes(5);
    expect(log).toHaveBeenCalledWith('PASS Database: C:/data/gauntlet.db opens');
    expect(process.exitCode ?? 0).toBe(0);
    process.exitCode = 0;
  });

  it('sets the exit code to 1 when a check fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await createDoctorCommand({
      environment: () => healthyEnvironment({ findBrowser: async () => undefined }),
    }).parseAsync(['node', 'doctor']);

    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

describe('/doctor in the prompt', () => {
  let tempDir: string;
  let database: SqliteDatabase;
  let written: string[];
  let output: TerminalOutput;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-doctor-'));
    database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
    runMigrations(database, await loadMigrations(migrationsFolder()));
    written = [];
    output = { isTerminal: false, write: (text) => written.push(text) };
  });

  afterEach(async () => {
    database.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs the same checks as the command', async () => {
    const environment = healthyEnvironment({ findBrowser: async () => undefined });
    const expected = (await runChecks(environment)).map(formatCheck);

    const inputs: LineInput[] = [{ kind: 'line', text: '/doctor' }, { kind: 'eof' }];
    const reader: LineReader = { read: async () => inputs.shift() ?? { kind: 'eof' } };
    setServicesFactory(async () => servicesFor(database, tempDir));

    await runChat({
      configFile: path.join(tempDir, 'config.json'),
      environment,
      launcher: { launch: async () => Promise.reject(new Error('unused')) },
      config: async () => parseConfig({ requests: { minDelaySeconds: 0 } }),
      reader,
      output,
      env: {},
    });

    const transcript = written.join('');
    for (const line of expected) {
      expect(transcript).toContain(line);
    }
    expect(transcript).toContain('FAIL Browser');
  });
});

describe.skipIf(process.platform !== 'win32')('doctor on this Windows machine', () => {
  it('runs the data folder, key store, and database checks for real', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-doctor-real-'));
    try {
      const platform = createWindowsPlatform({ LOCALAPPDATA: tempDir });
      const results = await runChecks(createDoctorEnvironment(platform, { LOCALAPPDATA: tempDir }));

      expect(results.find((result) => result.name === 'Data folder')?.status).toBe('pass');
      expect(results.find((result) => result.name === 'Database')?.status).toBe('pass');
      expect(results.find((result) => result.name === 'Key store')?.status).toBe('pass');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

/** The services of the prompt test. */
function servicesFor(database: SqliteDatabase, tempDir: string): Services {
  const accounts = new AccountManager(database);
  const dataPaths = {
    dataFolder: tempDir,
    configFile: path.join(tempDir, 'config.json'),
    databaseFile: path.join(tempDir, 'gauntlet.db'),
    sessionsFolder: path.join(tempDir, 'sessions'),
    keysFolder: path.join(tempDir, 'keys'),
    logsFolder: path.join(tempDir, 'logs'),
    keyFile: path.join(tempDir, 'keys', 'key.bin'),
    sessionFile: (accountId: string | number) =>
      path.join(tempDir, 'sessions', `${String(accountId)}.enc`),
    logFile: (name: string) => path.join(tempDir, 'logs', `${name}.log`),
  };

  return {
    database,
    accounts,
    vault: new SessionVault({ dataPaths, keyStore: new MemoryKeyStore() }),
    registry: new AdapterRegistry(),
    close: () => undefined,
  };
}
