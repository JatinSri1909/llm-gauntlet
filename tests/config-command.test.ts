import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { getSetting, listSettings, setSetting } from '../src/app/settings.js';
import { migrationsFolder, type Services } from '../src/app/services.js';
import { createConfigCommand } from '../src/cli/commands/config.js';
import { runChat } from '../src/cli/commands/chat.js';
import { setServicesFactory } from '../src/cli/commands/services.js';
import { parseConfig } from '../src/core/config.js';
import { AppError, ConfigError } from '../src/core/errors.js';
import type { LineInput, LineReader } from '../src/interactive/shell.js';
import type { TerminalOutput } from '../src/interactive/render.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';
import type { DataPaths } from '../src/platform/types.js';

let tempDir: string;
let configFile: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-config-'));
  configFile = path.join(tempDir, 'config.json');
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  await rm(tempDir, { recursive: true, force: true });
});

const settings = (): { configFile: string } => ({ configFile });

describe('settings', () => {
  it('shows the default value when there is no config file', async () => {
    expect(await getSetting(settings(), 'localOnly')).toBe('false');
  });

  it('lists every setting with its default', async () => {
    const text = await listSettings(settings());

    expect(text).toContain('"localOnly": false');
    expect(text).toContain('"maxTokens": 4000');
  });

  it('sets a value, saves it, and reads it back', async () => {
    const message = await setSetting(settings(), 'context.maxTokens', '2000');

    expect(message).toBe('Set context.maxTokens to 2000.');
    expect(await getSetting(settings(), 'context.maxTokens')).toBe('2000');
    const saved = JSON.parse(await readFile(configFile, 'utf8')) as {
      context: { maxTokens: number };
    };
    expect(saved.context.maxTokens).toBe(2000);
  });

  it('reads a value without quotes as text', async () => {
    await setSetting(settings(), 'classifier.provider', 'openrouter');

    expect(await getSetting(settings(), 'classifier.provider')).toBe('openrouter');
  });

  it('keeps the other saved values when one value changes', async () => {
    await setSetting(settings(), 'localOnly', 'true');
    await setSetting(settings(), 'logLevel', '"debug"');

    expect(await getSetting(settings(), 'localOnly')).toBe('true');
    expect(await getSetting(settings(), 'logLevel')).toBe('debug');
  });

  it('rejects a bad value and leaves the file as it was', async () => {
    await setSetting(settings(), 'localOnly', 'true');
    const before = await readFile(configFile, 'utf8');

    await expect(setSetting(settings(), 'usage.windowHours', '-5')).rejects.toBeInstanceOf(
      ConfigError,
    );

    expect(await readFile(configFile, 'utf8')).toBe(before);
  });

  it('rejects an unknown setting when it reads and when it sets', async () => {
    await expect(getSetting(settings(), 'nope')).rejects.toThrow('Unknown setting: nope');
    await expect(setSetting(settings(), 'nope', '1')).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects a setting name with an empty part', async () => {
    await expect(getSetting(settings(), 'context..maxTokens')).rejects.toThrow(
      'The setting name is not valid',
    );
  });

  it('refuses to change a setting under a value that is not an object', async () => {
    await writeFile(configFile, JSON.stringify({ localOnly: true }));

    await expect(setSetting(settings(), 'localOnly.sub', '1')).rejects.toThrow(
      'localOnly is not an object',
    );
  });

  it('refuses a config file that is not valid JSON', async () => {
    await writeFile(configFile, '{ not json');

    await expect(setSetting(settings(), 'localOnly', 'true')).rejects.toThrow(
      'The config file is not valid JSON',
    );
  });

  it('uses the given writer for the new file text', async () => {
    const write = vi.fn(async () => undefined);

    await setSetting({ configFile, writeFile: write }, 'localOnly', 'true');

    expect(write).toHaveBeenCalledWith(configFile, expect.stringContaining('"localOnly": true'));
  });
});

describe('gauntlet config command', () => {
  it('sets and gets a value through the command', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const command = createConfigCommand({ configFile: () => configFile });

    await command.parseAsync(['node', 'config', 'set', 'localOnly', 'true']);
    await command.parseAsync(['node', 'config', 'get', 'localOnly']);

    expect(log).toHaveBeenCalledWith('Set localOnly to true.');
    expect(log).toHaveBeenLastCalledWith('true');
    expect(process.exitCode).toBe(0);
  });

  it('prints the message and sets the exit code for a bad value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const command = createConfigCommand({ configFile: () => configFile });

    await command.parseAsync(['node', 'config', 'set', 'usage.windowHours', '-5']);

    expect(error).toHaveBeenCalledWith('The config file is not valid.');
    expect(process.exitCode).toBe(1);
  });
});

describe('/config in the prompt', () => {
  let database: SqliteDatabase;
  let written: string[];
  let output: TerminalOutput;

  beforeEach(async () => {
    database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
    runMigrations(database, await loadMigrations(migrationsFolder()));
    written = [];
    output = { isTerminal: false, write: (text) => written.push(text) };
    setServicesFactory(async () => servicesFor(database));
  });

  afterEach(() => {
    database.close();
  });

  it('gives the same result as the command', async () => {
    await setSetting(settings(), 'context.maxTokens', '2000');
    const cliText = await getSetting(settings(), 'context.maxTokens');

    await runPrompt(['/config context.maxTokens'], output);

    expect(written.join('')).toContain(`${cliText}\n`);
  });

  it('changes a value from the prompt and says when it applies', async () => {
    await runPrompt(['/config localOnly true'], output);

    expect(await getSetting(settings(), 'localOnly')).toBe('true');
    expect(written.join('')).toContain('Set localOnly to true.');
    expect(written.join('')).toContain('applies the next time you start gauntlet');
  });

  it('shows a bad value as an error and keeps the prompt', async () => {
    await runPrompt(['/config usage.windowHours -5'], output);

    expect(written.join('')).toContain('The config file is not valid.');
  });
});

/** Run the prompt with the given lines and the config file of this test. */
async function runPrompt(texts: string[], out: TerminalOutput): Promise<void> {
  const inputs: LineInput[] = [
    ...texts.map((text) => ({ kind: 'line' as const, text })),
    { kind: 'eof' },
  ];
  const reader: LineReader = {
    read: async () => inputs.shift() ?? { kind: 'eof' },
  };

  await runChat({
    configFile,
    launcher: {
      launch: async () => {
        throw new AppError('UNUSED', 'unused');
      },
    },
    config: async () => parseConfig({}),
    reader,
    output: out,
    env: {},
  });
}

/** The services of this test run. The config file is the one of this test. */
function servicesFor(database: SqliteDatabase): Services {
  const dataPaths: DataPaths = {
    dataFolder: tempDir,
    configFile,
    databaseFile: path.join(tempDir, 'gauntlet.db'),
    sessionsFolder: path.join(tempDir, 'sessions'),
    keysFolder: path.join(tempDir, 'keys'),
    logsFolder: path.join(tempDir, 'logs'),
    keyFile: path.join(tempDir, 'keys', 'key.bin'),
    sessionFile: (accountId) => path.join(tempDir, 'sessions', `${String(accountId)}.enc`),
    logFile: (name) => path.join(tempDir, 'logs', `${name}.log`),
  };

  return {
    database,
    accounts: new AccountManager(database),
    vault: new SessionVault({ dataPaths, keyStore: new MemoryKeyStore() }),
    registry: new AdapterRegistry(),
    close: () => undefined,
  };
}
