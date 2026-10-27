import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
import type { RunRequestResult } from '../src/app/run-request.js';
import { parseConfig, type Config } from '../src/core/config.js';
import { ContextStore } from '../src/context/context-store.js';
import { SLASH_COMMANDS } from '../src/interactive/commands/index.js';
import { type LineInput, type LineReader } from '../src/interactive/shell.js';
import { formatStatusLine } from '../src/interactive/status-line.js';
import type { TerminalOutput } from '../src/interactive/render.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import { MockAdapter } from '../src/providers/mock/mock-adapter.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

const SAVED_SESSION = { cookies: [], origins: [] };
const EOF: LineInput = { kind: 'eof' };
const RISK_CONFIRMATION: LineInput = { kind: 'line', text: 'I accept the risk' };

let tempDir: string;
let dataPaths: DataPaths;
let database: SqliteDatabase;
let accounts: AccountManager;
let vault: SessionVault;
let alpha: MockAdapter;
let registry: AdapterRegistry;
let launches: BrowserLaunchOptions[];
let launcher: BrowserLauncher;
let config: Config;
let written: string[];
let output: TerminalOutput;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-slash-'));
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

  launches = [];
  launcher = {
    launch: async (options: BrowserLaunchOptions): Promise<BrowserSession> => {
      launches.push(options);
      return {
        page: fakePage(),
        storageState: async () => SAVED_SESSION,
        close: async () => undefined,
      };
    },
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

/** Turn a list of lines into inputs. */
function lines(...texts: string[]): LineInput[] {
  return texts.map((text) => ({ kind: 'line', text }));
}

/** Run the prompt with the scripted inputs. */
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
    currentUrl: () => 'https://claude.ai/new',
    lastTextOf: async () => undefined,
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

describe('slash commands', () => {
  it('sends nothing for an unknown slash command and says how to get help', async () => {
    await addSignedInAccount('alpha', 'student-one');
    const reader = scriptedReader(...lines('/nope'), EOF);

    await runWith(reader);

    expect(transcript()).toContain('Unknown command: /nope.');
    expect(transcript()).toContain('/help');
    expect(alpha.requests).toHaveLength(0);
  });

  it('lists the commands with /help', async () => {
    await runWith(scriptedReader(...lines('/help'), EOF));

    for (const name of [
      '/help',
      '/login',
      '/logout',
      '/accounts',
      '/usage',
      '/new',
      '/resume',
      '/verbose',
      '/exit',
    ]) {
      expect(transcript()).toContain(name);
    }
    expect(SLASH_COMMANDS.map((command) => command.name)).toContain('login');
  });

  it('leaves the prompt on /exit', async () => {
    await addSignedInAccount('alpha', 'student-one');
    const reader = scriptedReader(...lines('/exit', 'hi'));

    await runWith(reader);

    expect(reader.reads).toBe(1);
    expect(alpha.requests).toHaveLength(0);
  });

  it('starts a new conversation with /new', async () => {
    await addSignedInAccount('alpha', 'student-one');

    await runWith(scriptedReader(...lines('hi', '/new', 'again')));

    expect(alpha.requests[1]?.text).toBe('again');
    expect(new ContextStore(database).listConversations()).toHaveLength(2);
  });

  it('lists the saved conversations with /resume and loads one', async () => {
    await addSignedInAccount('alpha', 'student-one');
    await runWith(scriptedReader(...lines('first topic', '/new', 'second topic')));

    const store = new ContextStore(database);
    const [newest, oldest] = store.listConversations();
    expect(oldest).toBeDefined();

    written = [];
    await runWith(scriptedReader(...lines('/resume')));
    expect(transcript()).toContain(`#${String(newest?.id)}`);
    expect(transcript()).toContain(`#${String(oldest?.id)}`);

    written = [];
    await runWith(scriptedReader(...lines(`/resume ${String(oldest?.id)}`, 'follow up')));
    expect(transcript()).toContain(`Resumed conversation #${String(oldest?.id)}.`);
    expect(transcript()).toContain('first topic');
    expect(alpha.requests.at(-1)?.text).toContain('A mock answer.');
  });

  it('rejects a /resume id that does not exist', async () => {
    await runWith(scriptedReader(...lines('/resume 999'), EOF));

    expect(transcript()).toContain('The conversation does not exist: 999');
  });

  it('turns the routing detail on and off with /verbose', async () => {
    await addSignedInAccount('alpha', 'student-one');

    await runWith(scriptedReader(...lines('hi')));
    expect(transcript()).not.toContain('first class');

    written = [];
    await runWith(scriptedReader(...lines('/verbose', 'hi')));
    expect(transcript()).toContain('Verbose detail is on.');
    expect(transcript()).toContain('first class simple from local rules');
  });

  it('prints the status line after each answer', async () => {
    await addSignedInAccount('alpha', 'student-one');

    await runWith(scriptedReader(...lines('hi')));

    expect(transcript()).toContain('class simple  account student-one  model alpha-cheap');
  });

  it('shows the accounts with /accounts and their usage with /usage', async () => {
    await addSignedInAccount('alpha', 'student-one');
    await runWith(scriptedReader(...lines('hi')));

    written = [];
    await runWith(scriptedReader(...lines('/accounts', '/usage')));

    expect(transcript()).toMatch(/alpha student-one\s+ready/);
    expect(transcript()).toMatch(/alpha student-one\s+ready\s+1\s+\d+/);
  });

  it('runs the login flow with /login and returns to the prompt', async () => {
    const reader = scriptedReader(...lines('/login alpha student-two'), RISK_CONFIRMATION, EOF);

    await runWith(reader);

    const account = accounts.find('alpha', 'student-two');
    expect(account?.state).toBe('ready');
    expect(await vault.hasSession(account?.id ?? 0)).toBe(true);
    expect(transcript()).toContain('Saved the account: alpha student-two');
    expect(reader.reads).toBe(3);
  });

  it('signs out of an account with /logout and keeps the account', async () => {
    const id = await addSignedInAccount('alpha', 'student-one');

    await runWith(scriptedReader(...lines('/logout alpha student-one'), EOF));

    expect(accounts.get(id)?.state).toBe('needs_login');
    expect(await vault.hasSession(id)).toBe(false);
    expect(transcript()).toContain('Signed out of the account: alpha student-one');
  });

  it('gives a clear error when a command needs an argument', async () => {
    await runWith(scriptedReader(...lines('/login'), EOF));

    expect(transcript()).toContain('Give the provider name.');
  });
});

describe('status line', () => {
  it('shows the class, the account label, and the model', () => {
    const result = {
      difficulty: 'hard',
      escalated: false,
      account: { label: 'student-one' },
      model: 'alpha-big',
      classification: { class: 'hard', source: 'local', apiAttempts: 0 },
    } as unknown as RunRequestResult;

    expect(formatStatusLine(result, false)).toBe(
      'class hard  account student-one  model alpha-big',
    );
    expect(formatStatusLine(result, true)).toContain('first class hard from local rules');
    expect(formatStatusLine(result, true)).toContain('not escalated');
  });
});
