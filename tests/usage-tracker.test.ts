import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountManager } from '../src/accounts/account-manager.js';
import { createUsageCommand } from '../src/cli/commands/usage.js';
import { setServicesFactory } from '../src/cli/commands/services.js';
import { migrationsFolder, type Services } from '../src/app/services.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';
import { UsageTracker } from '../src/usage/usage-tracker.js';

const HOUR_MS = 60 * 60 * 1000;
const START = new Date('2026-10-26T10:00:00.000Z');

/** A clock that the test moves by hand. */
class FakeClock {
  current: Date;

  constructor(start: Date) {
    this.current = new Date(start.getTime());
  }

  now = (): Date => new Date(this.current.getTime());

  advanceHours(hours: number): void {
    this.current = new Date(this.current.getTime() + hours * HOUR_MS);
  }
}

let tempDir: string;
let database: SqliteDatabase;
let accounts: AccountManager;
let clock: FakeClock;
let tracker: UsageTracker;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-usage-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  accounts = new AccountManager(database);
  clock = new FakeClock(START);
  tracker = new UsageTracker({ database, accounts, windowHours: 24, now: clock.now });
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe('UsageTracker', () => {
  it('counts requests and tokens in the rolling window', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });

    tracker.recordRequest(account.id, 'model-a', 100);
    tracker.recordRequest(account.id, 'model-a', 250);

    expect(tracker.totals(account.id)).toEqual({ requests: 2, tokens: 350 });
  });

  it('drops a request that falls out of the window', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });

    tracker.recordRequest(account.id, 'model-a', 100);
    clock.advanceHours(25);
    tracker.recordRequest(account.id, 'model-a', 40);

    expect(tracker.totals(account.id)).toEqual({ requests: 1, tokens: 40 });
  });

  it('keeps the counts of each account apart', () => {
    const first = accounts.add({ provider: 'mock', label: 'student-one' });
    const second = accounts.add({ provider: 'mock', label: 'student-two' });

    tracker.recordRequest(first.id, 'model-a', 10);

    expect(tracker.totals(first.id)).toEqual({ requests: 1, tokens: 10 });
    expect(tracker.totals(second.id)).toEqual({ requests: 0, tokens: 0 });
  });

  it('rejects a negative or fractional token count', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });

    expect(() => tracker.recordRequest(account.id, 'model-a', -1)).toThrow(
      'The token count must be a whole number',
    );
    expect(() => tracker.recordRequest(account.id, 'model-a', 1.5)).toThrow(
      'The token count must be a whole number',
    );
  });

  it('sets cooling down until the reset time of a limit message', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });
    const resetAt = new Date(START.getTime() + 3 * HOUR_MS);

    const coolingUntil = tracker.recordLimit(account.id, resetAt);

    expect(coolingUntil).toEqual(resetAt);
    expect(accounts.get(account.id)?.state).toBe('cooling_down');
    expect(accounts.get(account.id)?.coolingUntil).toEqual(resetAt);
    expect(tracker.isReady(account.id)).toBe(false);
  });

  it('uses the window length when the limit message has no reset time', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });

    const coolingUntil = tracker.recordLimit(account.id);

    expect(coolingUntil).toEqual(new Date(START.getTime() + 24 * HOUR_MS));
  });

  it('uses the window length when the reset time is already past', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });
    const pastReset = new Date(START.getTime() - HOUR_MS);

    const coolingUntil = tracker.recordLimit(account.id, pastReset);

    expect(coolingUntil).toEqual(new Date(START.getTime() + 24 * HOUR_MS));
  });

  it('keeps the account cooling down until the reset time and makes it ready after', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });
    tracker.recordLimit(account.id, new Date(START.getTime() + 3 * HOUR_MS));

    clock.advanceHours(2);
    expect(tracker.refreshState(account.id)).toBe('cooling_down');

    clock.advanceHours(1);
    expect(tracker.refreshState(account.id)).toBe('ready');
    expect(tracker.isReady(account.id)).toBe(true);
    expect(accounts.get(account.id)?.state).toBe('ready');
  });

  it('does not change an account that is not cooling down', () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });
    accounts.setState(account.id, 'blocked');

    expect(tracker.refreshState(account.id)).toBe('blocked');
    expect(tracker.isReady(account.id)).toBe(false);
  });

  it('throws a typed error for an account that does not exist', () => {
    expect(() => tracker.recordLimit(999)).toThrow('The account does not exist: 999');
    expect(() => tracker.refreshState(999)).toThrow('The account does not exist: 999');
  });

  it('rejects a window that is not a positive number of hours', () => {
    expect(() => new UsageTracker({ database, accounts, windowHours: 0, now: clock.now })).toThrow(
      'The usage window must be a positive number of hours.',
    );
  });

  it('lists the usage and the state of every account', () => {
    const first = accounts.add({ provider: 'mock', label: 'student-one' });
    accounts.add({ provider: 'mock', label: 'student-two' });
    tracker.recordRequest(first.id, 'model-a', 30);
    tracker.recordLimit(first.id, new Date(START.getTime() + HOUR_MS));

    const summaries = tracker.summaries();

    expect(summaries.map((summary) => summary.account.label)).toEqual([
      'student-one',
      'student-two',
    ]);
    expect(summaries[0]?.totals).toEqual({ requests: 1, tokens: 30 });
    expect(summaries[0]?.state).toBe('cooling_down');
    expect(summaries[1]?.state).toBe('needs_login');
  });
});

describe('usage command', () => {
  it('prints the usage of each account', async () => {
    const account = accounts.add({ provider: 'mock', label: 'student-one' });
    // The command reads the real clock, so this record uses the real clock too.
    new UsageTracker({ database, accounts, windowHours: 24 }).recordRequest(
      account.id,
      'model-a',
      120,
    );

    const services = {
      database,
      accounts,
      close: () => undefined,
    } as unknown as Services;
    setServicesFactory(async () => services);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await createUsageCommand({ windowHours: async () => 24 }).parseAsync(['node', 'usage']);

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('mock student-one [needs login]: 1 requests, 120 tokens'),
      );
    } finally {
      log.mockRestore();
    }
  });
});
