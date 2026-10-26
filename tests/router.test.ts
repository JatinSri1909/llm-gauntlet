import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { migrationsFolder } from '../src/app/services.js';
import { Router, type RouterOptions } from '../src/decision/router.js';
import type { ModelConfig } from '../src/decision/model-map.js';
import { MockAdapter } from '../src/providers/mock/mock-adapter.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';
import { UsageTracker } from '../src/usage/usage-tracker.js';

const HOUR_MS = 60 * 60 * 1000;
const START = new Date('2026-10-27T09:00:00.000Z');

let tempDir: string;
let database: SqliteDatabase;
let accounts: AccountManager;
let registry: AdapterRegistry;
let usage: UsageTracker;
let current: Date;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-router-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  accounts = new AccountManager(database);
  current = START;
  usage = new UsageTracker({
    database,
    accounts,
    windowHours: 24,
    now: () => new Date(current.getTime()),
  });

  registry = new AdapterRegistry();
  registry.register(
    new MockAdapter({ name: 'alpha', models: ['alpha-cheap', 'alpha-mid', 'alpha-big'] }),
  );
  registry.register(new MockAdapter({ name: 'beta', models: ['beta-small', 'beta-large'] }));
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

/** Make a router with the given config models. */
function makeRouter(models: ModelConfig = {}): Router {
  const options: RouterOptions = { accounts, usage, registry, models };
  return new Router(options);
}

/** Add an account and mark it ready. */
function addReadyAccount(provider: string, label: string): number {
  const account = accounts.add({ provider, label });
  accounts.setState(account.id, 'ready');
  return account.id;
}

describe('Router model choice', () => {
  it('picks the cheapest model for a simple task', () => {
    addReadyAccount('alpha', 'student-one');

    expect(makeRouter().route('simple').model).toBe('alpha-cheap');
  });

  it('picks the middle model for a standard task', () => {
    addReadyAccount('alpha', 'student-one');

    expect(makeRouter().route('standard').model).toBe('alpha-mid');
  });

  it('picks the most capable model for a hard task', () => {
    addReadyAccount('alpha', 'student-one');

    expect(makeRouter().route('hard').model).toBe('alpha-big');
  });

  it('uses the model from the config file when one is set', () => {
    addReadyAccount('alpha', 'student-one');
    const models: ModelConfig = {
      alpha: { simple: 'configured-small', standard: 'configured-mid', hard: 'configured-big' },
    };

    expect(makeRouter(models).route('simple').model).toBe('configured-small');
  });
});

describe('Router account choice', () => {
  it('skips an account that is cooling down', () => {
    const cooling = addReadyAccount('alpha', 'student-one');
    addReadyAccount('beta', 'student-two');
    usage.recordLimit(cooling, new Date(START.getTime() + HOUR_MS));

    const choice = makeRouter().route('simple');

    expect(choice.account.provider).toBe('beta');
    expect(choice.model).toBe('beta-small');
  });

  it('skips an account that needs a login', () => {
    accounts.add({ provider: 'alpha', label: 'not-signed-in' });
    addReadyAccount('beta', 'student-two');

    expect(makeRouter().route('simple').account.label).toBe('student-two');
  });

  it('skips an account whose provider has no adapter', () => {
    addReadyAccount('gone', 'orphan');
    addReadyAccount('beta', 'student-two');

    expect(makeRouter().route('simple').account.provider).toBe('beta');
  });

  it('picks the account with the fewest tokens in the window', () => {
    const busy = addReadyAccount('alpha', 'busy');
    addReadyAccount('alpha', 'quiet');
    usage.recordRequest(busy, 'alpha-cheap', 500);

    expect(makeRouter().route('simple').account.label).toBe('quiet');
  });

  it('keeps the list order when the usage is equal', () => {
    addReadyAccount('alpha', 'first');
    addReadyAccount('alpha', 'second');

    expect(makeRouter().route('simple').account.label).toBe('first');
  });

  it('picks the next account when the first one is excluded after a failure', () => {
    const first = addReadyAccount('alpha', 'student-one');
    addReadyAccount('beta', 'student-two');
    const router = makeRouter();

    const firstChoice = router.route('hard');
    expect(firstChoice.account.id).toBe(first);

    const nextChoice = router.route('hard', new Set([first]));
    expect(nextChoice.account.label).toBe('student-two');
    expect(nextChoice.model).toBe('beta-large');
  });

  it('throws an error when no account is ready', () => {
    accounts.add({ provider: 'alpha', label: 'not-signed-in' });

    expect(() => makeRouter().route('hard')).toThrow('No account is ready for a hard task.');
  });

  it('throws an error when every ready account is excluded', () => {
    const only = addReadyAccount('alpha', 'student-one');

    expect(() => makeRouter().route('simple', new Set([only]))).toThrow(
      'No account is ready for a simple task.',
    );
  });

  it('uses the account again after its reset time passes', () => {
    const account = addReadyAccount('alpha', 'student-one');
    usage.recordLimit(account, new Date(START.getTime() + HOUR_MS));
    const router = makeRouter();

    expect(() => router.route('simple')).toThrow('No account is ready');

    current = new Date(START.getTime() + HOUR_MS);

    expect(router.route('simple').account.id).toBe(account);
  });
});
