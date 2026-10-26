import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { migrationsFolder, type Services } from '../src/app/services.js';
import { runRequest, type RunRequestOptions } from '../src/app/run-request.js';
import { createAskCommand } from '../src/cli/commands/ask.js';
import { setServicesFactory } from '../src/cli/commands/services.js';
import type {
  BrowserLauncher,
  BrowserLaunchOptions,
  BrowserPage,
  BrowserSession,
} from '../src/browser/types.js';
import { parseConfig, type Config } from '../src/core/config.js';
import { ContextStore } from '../src/context/context-store.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import { MockAdapter, type MockScript } from '../src/providers/mock/mock-adapter.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import { SecretStore } from '../src/security/secret-store.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';
import { UsageTracker } from '../src/usage/usage-tracker.js';

const HOUR_MS = 60 * 60 * 1000;
const SAVED_SESSION = { cookies: [], origins: [] };

let tempDir: string;
let dataPaths: DataPaths;
let database: SqliteDatabase;
let accounts: AccountManager;
let vault: SessionVault;
let alpha: MockAdapter;
let beta: MockAdapter;
let registry: AdapterRegistry;
let launches: BrowserLaunchOptions[];
let launcher: BrowserLauncher;
let config: Config;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-ask-'));
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
  beta = new MockAdapter({ name: 'beta', models: ['beta-small', 'beta-large'] });
  registry = new AdapterRegistry();
  registry.register(alpha);
  registry.register(beta);

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

  config = parseConfig({});
});

afterEach(async () => {
  vi.restoreAllMocks();
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

/** Add an account with a saved session and mark it ready. */
async function addSignedInAccount(provider: string, label: string): Promise<number> {
  const account = accounts.add({ provider, label });
  accounts.setState(account.id, 'ready');
  await vault.save(account.id, SAVED_SESSION);
  return account.id;
}

/** Run one request with the test parts. */
function requestOptions(text: string, extra: Partial<RunRequestOptions> = {}): RunRequestOptions {
  return {
    text,
    config,
    accounts,
    vault,
    registry,
    store: new ContextStore(database),
    usage: new UsageTracker({ database, accounts, windowHours: 24 }),
    launcher,
    secrets: new SecretStore(vault),
    ...extra,
  };
}

/** Set the next result of an adapter. */
function script(adapter: MockAdapter, next: MockScript): void {
  adapter.setNext(next);
}

describe('ask command', () => {
  it('prints the answer and saves the records', async () => {
    const accountId = await addSignedInAccount('alpha', 'student-one');
    setServicesFactory(async () => servicesFor());
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await createAskCommand({ launcher, config: async () => config }).parseAsync([
        'node',
        'ask',
        'hi',
      ]);

      expect(log).toHaveBeenCalledWith('A mock answer.');
    } finally {
      log.mockRestore();
    }

    const store = new ContextStore(database);
    const [conversation] = store.listConversations();
    const messages = store.lastMessages(conversation?.id ?? 0, 10);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1]?.accountId).toBe(accountId);
    expect(messages[1]?.class).toBe('simple');
  });
});

describe('runRequest', () => {
  it('classifies the task, picks the cheapest model, and saves the answer', async () => {
    const accountId = await addSignedInAccount('alpha', 'student-one');

    const result = await runRequest(requestOptions('hi'));

    expect(result.text).toBe('A mock answer.');
    expect(result.difficulty).toBe('simple');
    expect(result.classification.source).toBe('local');
    expect(result.account.id).toBe(accountId);
    expect(result.model).toBe('alpha-cheap');
    expect(result.escalated).toBe(false);
    expect(result.warning).toBeUndefined();
    expect(alpha.requests).toEqual([{ text: 'hi', model: 'alpha-cheap' }]);
    expect(launches[0]?.purpose).toBe('request');
    expect(launches[0]?.storageState).toEqual(SAVED_SESSION);

    const store = new ContextStore(database);
    const messages = store.lastMessages(result.conversationId, 10);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1]?.content).toBe('A mock answer.');

    const usage = new UsageTracker({ database, accounts, windowHours: 24 }).totals(accountId);
    expect(usage.requests).toBe(1);
    expect(usage.tokens).toBeGreaterThan(0);
  });

  it('moves to the next account after a limit and records the limit', async () => {
    const limited = await addSignedInAccount('alpha', 'student-one');
    await addSignedInAccount('beta', 'student-two');
    const resetAt = new Date(Date.now() + HOUR_MS);
    script(alpha, { kind: 'limitReached', resetAt });
    script(beta, { kind: 'answer', text: 'From the second account.' });

    const result = await runRequest(requestOptions('Explain quantum tunneling in one paragraph.'));

    expect(result.text).toBe('From the second account.');
    expect(result.account.provider).toBe('beta');
    expect(result.model).toBe('beta-small');
    expect(result.skipped).toEqual([
      { provider: 'alpha', label: 'student-one', reason: 'limit reached' },
    ]);
    expect(accounts.get(limited)?.state).toBe('cooling_down');
  });

  it('skips an account with no saved session and marks it as needing login', async () => {
    const unsaved = accounts.add({ provider: 'alpha', label: 'no-session' });
    accounts.setState(unsaved.id, 'ready');
    await addSignedInAccount('beta', 'student-two');

    const result = await runRequest(requestOptions('hi'));

    expect(result.account.provider).toBe('beta');
    expect(result.skipped).toEqual([
      { provider: 'alpha', label: 'no-session', reason: 'needs login' },
    ]);
    expect(accounts.get(unsaved.id)?.state).toBe('needs_login');
    expect(alpha.requests).toHaveLength(0);
  });

  it('stops on a CAPTCHA and asks the user to solve it', async () => {
    await addSignedInAccount('alpha', 'student-one');
    script(alpha, { kind: 'captchaRequired' });

    await expect(runRequest(requestOptions('hi'))).rejects.toMatchObject({
      code: 'CAPTCHA_REQUIRED',
    });
    expect(alpha.requests).toHaveLength(1);
  });

  it('escalates once after two empty answers and saves no empty assistant message', async () => {
    await addSignedInAccount('alpha', 'student-one');
    script(alpha, { kind: 'answer', text: '' });

    const result = await runRequest(requestOptions('Explain quantum tunneling in one paragraph.'));

    expect(result.escalated).toBe(true);
    expect(result.difficulty).toBe('hard');
    expect(result.model).toBe('alpha-big');
    expect(result.warning).toBe('empty');
    expect(alpha.requests.map((request) => request.model)).toEqual(['alpha-mid', 'alpha-big']);

    const messages = new ContextStore(database).lastMessages(result.conversationId, 10);
    expect(messages.map((message) => message.role)).toEqual(['user']);
  });

  it('reports a clear error when no account is ready', async () => {
    accounts.add({ provider: 'alpha', label: 'not-signed-in' });

    await expect(runRequest(requestOptions('hi'))).rejects.toMatchObject({
      code: 'NO_ACCOUNT_READY',
    });
  });
});

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
