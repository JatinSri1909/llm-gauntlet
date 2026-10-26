import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runLoginFlow } from '../src/accounts/login-flow.js';
import { AccountManager } from '../src/accounts/account-manager.js';
import { migrationsFolder } from '../src/app/services.js';
import type {
  BrowserLaunchOptions,
  BrowserLauncher,
  BrowserSession,
} from '../src/browser/types.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import { createMockAdapter } from '../src/providers/mock/mock-adapter.js';
import type { ProviderPage } from '../src/providers/types.js';
import { SessionVault } from '../src/security/session-vault.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

const sessionState = {
  cookies: [{ name: 'session', value: 'fake-cookie-value-for-tests', domain: '.mock.test' }],
  origins: [],
};

let tempDir: string;
let database: SqliteDatabase;
let accounts: AccountManager;
let dataPaths: DataPaths;
let vault: SessionVault;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-login-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  accounts = new AccountManager(database);

  const sessionsFolder = path.join(tempDir, 'sessions');
  const keysFolder = path.join(tempDir, 'keys');
  const logsFolder = path.join(tempDir, 'logs');

  dataPaths = {
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

  vault = new SessionVault({ dataPaths, keyStore: new MemoryKeyStore() });
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

class FakeBrowserLauncher implements BrowserLauncher {
  readonly calls: BrowserLaunchOptions[] = [];
  private readonly session: BrowserSession;

  constructor(session: BrowserSession) {
    this.session = session;
  }

  async launch(options: BrowserLaunchOptions): Promise<BrowserSession> {
    this.calls.push(options);
    return this.session;
  }
}

function makePage(body: string): ProviderPage {
  return {
    goto: async () => undefined,
    waitForSelector: async () => undefined,
    textOf: async () => undefined,
    isVisible: async () => false,
    bodyText: async () => body,
    fill: async () => undefined,
    press: async () => undefined,
    waitForTimeout: async () => undefined,
  };
}

function makeSession(page: ProviderPage): {
  session: BrowserSession;
  close: ReturnType<typeof vi.fn>;
} {
  const close = vi.fn(async () => undefined);

  return {
    session: {
      page,
      storageState: async () => sessionState,
      close,
    },
    close,
  };
}

describe('login flow', () => {
  it('saves the encrypted session state after a sign-in', async () => {
    const adapter = createMockAdapter();
    const { session, close } = makeSession(makePage('Welcome back.'));
    const launcher = new FakeBrowserLauncher(session);
    const output = { write: vi.fn() };

    const result = await runLoginFlow({ adapter, launcher, accounts, vault, output });

    expect(result.kind).toBe('signedIn');
    if (result.kind !== 'signedIn') {
      throw new Error('The login did not finish.');
    }

    expect(result.account.provider).toBe('mock');
    expect(result.account.label).toBe('mock');
    expect(result.account.state).toBe('ready');
    expect(launcher.calls[0]?.purpose).toBe('login');
    expect(launcher.calls[0]?.startUrl).toBe(adapter.loginUrl);
    expect(await vault.hasSession(result.account.id)).toBe(true);
    expect(await vault.load(result.account.id)).toEqual(sessionState);

    const raw = await readFile(dataPaths.sessionFile(result.account.id), 'latin1');
    expect(raw).not.toContain('fake-cookie-value-for-tests');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('stops on a CAPTCHA and asks the user to solve it', async () => {
    const adapter = createMockAdapter();
    adapter.setSignedIn(false);

    const { session, close } = makeSession(makePage('Please complete the CAPTCHA to continue.'));
    const launcher = new FakeBrowserLauncher(session);
    const output = { write: vi.fn() };

    const result = await runLoginFlow({ adapter, launcher, accounts, vault, output });

    expect(result.kind).toBe('captchaRequired');

    const message = output.write.mock.calls.map((call) => String(call[0])).join('\n');
    expect(message).toMatch(/CAPTCHA/);
    expect(message).toMatch(/solve/i);
    expect(message).toMatch(/visible/i);
    expect(accounts.list()).toHaveLength(0);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
