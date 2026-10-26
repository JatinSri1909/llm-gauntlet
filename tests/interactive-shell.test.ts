import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { migrationsFolder, type Services } from '../src/app/services.js';
import { runChat } from '../src/cli/commands/chat.js';
import { setServicesFactory } from '../src/cli/commands/services.js';
import type {
  BrowserLauncher,
  BrowserLaunchOptions,
  BrowserPage,
  BrowserSession,
} from '../src/browser/types.js';
import { parseConfig, type Config } from '../src/core/config.js';
import { ContextStore } from '../src/context/context-store.js';
import {
  createStyle,
  isNoColorSet,
  startSpinner,
  type TerminalOutput,
} from '../src/interactive/render.js';
import { SLASH_COMMANDS } from '../src/interactive/commands/index.js';
import { PROMPT, runShell, type LineInput, type LineReader } from '../src/interactive/shell.js';
import { createTerminalReader } from '../src/interactive/terminal-reader.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import { MockAdapter, type MockScript } from '../src/providers/mock/mock-adapter.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';
import { UsageTracker } from '../src/usage/usage-tracker.js';

const SAVED_SESSION = { cookies: [], origins: [] };
const EOF: LineInput = { kind: 'eof' };

let tempDir: string;
let dataPaths: DataPaths;
let database: SqliteDatabase;
let accounts: AccountManager;
let vault: SessionVault;
let alpha: MockAdapter;
let registry: AdapterRegistry;
let launcher: BrowserLauncher;
let config: Config;
let written: string[];
let output: TerminalOutput;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-shell-'));
  dataPaths = {
    dataFolder: tempDir,
    configFile: path.join(tempDir, 'config.json'),
    databaseFile: path.join(tempDir, 'gauntlet.db'),
    sessionsFolder: path.join(tempDir, 'sessions'),
    keysFolder: path.join(tempDir, 'keys'),
    logsFolder: path.join(tempDir, 'logs'),
    keyFile: path.join(tempDir, 'keys', 'key.bin'),
    sessionFile: (accountId) => path.join(tempDir, 'sessions', `${String(accountId)}.enc`),
    logFile: (name) => path.join(tempDir, 'logs', `${name}.log`),
  };

  database = new SqliteDatabase(dataPaths.databaseFile);
  runMigrations(database, await loadMigrations(migrationsFolder()));
  accounts = new AccountManager(database);
  vault = new SessionVault({ dataPaths, keyStore: new MemoryKeyStore() });

  alpha = new MockAdapter({ name: 'alpha', models: ['alpha-cheap', 'alpha-mid', 'alpha-big'] });
  registry = new AdapterRegistry();
  registry.register(alpha);

  launcher = {
    launch: async (_options: BrowserLaunchOptions): Promise<BrowserSession> => ({
      page: fakePage(),
      storageState: async () => SAVED_SESSION,
      close: async () => undefined,
    }),
  };

  config = parseConfig({ requests: { minDelaySeconds: 0 } });
  written = [];
  output = { isTerminal: false, write: (text) => written.push(text) };
  setServicesFactory(async () => servicesFor());
});

afterEach(async () => {
  vi.restoreAllMocks();
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

/** Add a signed-in account and mark it ready. */
async function addSignedInAccount(provider: string, label: string): Promise<number> {
  const account = accounts.add({ provider, label });
  accounts.setState(account.id, 'ready');
  await vault.save(account.id, SAVED_SESSION);
  return account.id;
}

/** Set the result of the next adapter request. */
function script(next: MockScript): void {
  alpha.setNext(next);
}

/** A reader that gives the inputs in turn. It gives eof when the inputs run out. */
function scriptedReader(...inputs: LineInput[]): LineReader & { reads: number } {
  const queue = [...inputs];
  const reader = {
    reads: 0,
    read: async (_prompt: string): Promise<LineInput> => {
      reader.reads += 1;
      return queue.shift() ?? EOF;
    },
  };
  return reader;
}

/** Run the prompt with the scripted inputs and the test parts. */
async function runWith(reader: LineReader): Promise<void> {
  await runChat({ launcher, config: async () => config, reader, output, env: {} });
}

/** The text that the shell wrote, joined. */
function transcript(): string {
  return written.join('');
}

/** The services of this test run. */
function servicesFor(): Services {
  return { database, accounts, vault, registry, close: () => undefined };
}

/** A page that does nothing. The mock adapter never reads it. */
function fakePage(): BrowserPage {
  return {
    goto: async () => undefined,
    waitForSelector: async () => undefined,
    textOf: async () => undefined,
    isVisible: async () => false,
    bodyText: async () => '',
    fill: async () => undefined,
    press: async () => undefined,
    click: async () => undefined,
    waitForTimeout: async () => undefined,
  };
}

describe('interactive prompt', () => {
  it('keeps one conversation and sends the earlier answer as context', async () => {
    await addSignedInAccount('alpha', 'student-one');
    const reader = scriptedReader(
      { kind: 'line', text: 'hi' },
      { kind: 'line', text: 'and again' },
    );

    await runWith(reader);

    expect(alpha.requests).toHaveLength(2);
    expect(alpha.requests[0]?.text).toBe('hi');
    expect(alpha.requests[1]?.text).toContain('A mock answer.');
    expect(new ContextStore(database).listConversations()).toHaveLength(1);
    expect(transcript()).toContain('A mock answer.\n');
  });

  it('leaves the prompt on Ctrl+D', async () => {
    await addSignedInAccount('alpha', 'student-one');
    const reader = scriptedReader(EOF);

    await runWith(reader);

    expect(reader.reads).toBe(1);
    expect(alpha.requests).toHaveLength(0);
  });

  it('leaves the prompt on Ctrl+C', async () => {
    await addSignedInAccount('alpha', 'student-one');
    const reader = scriptedReader({ kind: 'interrupt' }, { kind: 'line', text: 'hi' });

    await runWith(reader);

    expect(reader.reads).toBe(1);
    expect(alpha.requests).toHaveLength(0);
  });

  it('prints the CAPTCHA message and returns to the prompt', async () => {
    await addSignedInAccount('alpha', 'student-one');
    script({ kind: 'captchaRequired' });
    const reader = scriptedReader({ kind: 'line', text: 'hi' });

    await runWith(reader);

    expect(transcript()).toContain('CAPTCHA');
    expect(transcript()).toContain('visible browser window');
    expect(reader.reads).toBe(2);
  });

  it('prints a typed error and returns to the prompt', async () => {
    accounts.add({ provider: 'alpha', label: 'not-signed-in' });
    const reader = scriptedReader({ kind: 'line', text: 'hi' });

    await runWith(reader);

    expect(transcript()).toContain('No account is ready for a simple task.');
    expect(reader.reads).toBe(2);
  });

  it('sends nothing for an empty line', async () => {
    await addSignedInAccount('alpha', 'student-one');
    const reader = scriptedReader({ kind: 'line', text: '   ' });

    await runWith(reader);

    expect(alpha.requests).toHaveLength(0);
  });

  it('writes no color codes and no spinner when the output is not a terminal', async () => {
    await addSignedInAccount('alpha', 'student-one');
    script({ kind: 'answer', text: 'Plain answer.' });

    await runWith(scriptedReader({ kind: 'line', text: 'hi' }));

    // The second newline ends the prompt line when the input runs out.
    expect(transcript()).toBe(
      'Plain answer.\n[class simple | account student-one | model alpha-cheap]\n\n',
    );
    expect(transcript()).not.toContain('\u001b');
    expect(transcript()).not.toContain('Thinking');
  });
});

describe('shell output helpers', () => {
  it('adds colors only to a terminal without NO_COLOR', () => {
    const terminal: TerminalOutput = { isTerminal: true, write: () => undefined };

    expect(createStyle(terminal, {}).paint('text', 'red')).toContain('\u001b[31m');
    expect(createStyle(terminal, { NO_COLOR: '1' }).paint('text', 'red')).toBe('text');
    expect(createStyle(output, {}).paint('text', 'red')).toBe('text');
    expect(isNoColorSet({ NO_COLOR: '' })).toBe(false);
  });

  it('starts and clears the spinner only on a terminal', () => {
    const lines: string[] = [];
    const terminal: TerminalOutput = { isTerminal: true, write: (text) => lines.push(text) };

    const spinner = startSpinner(terminal, {}, 'Thinking');
    expect(lines[0]).toContain('Thinking');
    spinner.stop();
    expect(lines.at(-1)).toMatch(/^\r +\r$/);

    const quiet: string[] = [];
    startSpinner(
      { isTerminal: true, write: (text) => quiet.push(text) },
      { NO_COLOR: '1' },
      'x',
    ).stop();
    expect(quiet).toHaveLength(0);
  });

  it('returns from the shell on the first Ctrl+C', async () => {
    const reader = scriptedReader({ kind: 'interrupt' });

    await runShell({
      reader,
      output,
      env: {},
      send: async () => {
        throw new Error('no request should be sent');
      },
      commands: SLASH_COMMANDS,
      services: {
        database,
        accounts,
        vault,
        registry,
        store: new ContextStore(database),
        usage: new UsageTracker({ database, accounts, windowHours: 24 }),
        windowHours: 24,
        configFile: dataPaths.configFile,
        environment: {
          nodeVersion: '24.0.0',
          dataFolder: tempDir,
          databaseFile: dataPaths.databaseFile,
          keyStore: { hasKey: async () => true, getKey: async () => Buffer.alloc(32) },
          folderIsWritable: async () => true,
          findBrowser: async () => undefined,
          checkDatabase: async () => undefined,
        },
        launcher,
      },
    });

    expect(reader.reads).toBe(1);
  });
});

describe('terminal reader', () => {
  it('keeps lines that arrive while the shell is busy', async () => {
    const input = new PassThrough();
    const sink = new PassThrough();
    const reader = createTerminalReader(input, sink);

    input.write('first\nsecond\n');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await reader.read(PROMPT)).toEqual({ kind: 'line', text: 'first' });
    expect(await reader.read(PROMPT)).toEqual({ kind: 'line', text: 'second' });

    input.end();
    expect(await reader.read(PROMPT)).toEqual({ kind: 'eof' });
    reader.close();
  });
});
