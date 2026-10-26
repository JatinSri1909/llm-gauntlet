import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrationsFolder } from '../src/app/services.js';
import { SqliteRequestPacer, waitMessage, type WaitReason } from '../src/app/request-pacer.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

const MIN_DELAY_MS = 10_000;

let tempDir: string;
let database: SqliteDatabase;
let clock: number;
let sleeps: number[];

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-pacer-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  clock = 1_000_000;
  sleeps = [];
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

/** A pacer on the test database. A sleep moves the fake clock forward. */
function makePacer(): SqliteRequestPacer {
  return new SqliteRequestPacer({
    database,
    minDelayMs: MIN_DELAY_MS,
    now: () => clock,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
    },
  });
}

describe('SqliteRequestPacer', () => {
  it('runs the action and returns its result', async () => {
    const result = await makePacer().run(1, async () => 'answer');

    expect(result).toBe('answer');
  });

  it('waits the minimum delay after the last request of the same account', async () => {
    const pacer = makePacer();
    await pacer.run(1, async () => undefined);

    await pacer.run(1, async () => undefined);

    expect(sleeps.reduce((total, milliseconds) => total + milliseconds, 0)).toBe(MIN_DELAY_MS);
  });

  it('does not wait for a different account', async () => {
    const pacer = makePacer();
    await pacer.run(1, async () => undefined);

    await pacer.run(2, async () => undefined);

    expect(sleeps).toEqual([]);
  });

  it('keeps one request at a time for an account, across two pacers on one store', async () => {
    // The real clock and sleep are used here, because the second pacer must really wait.
    const first = new SqliteRequestPacer({ database, minDelayMs: 0 });
    const second = new SqliteRequestPacer({ database, minDelayMs: 0 });
    const order: string[] = [];
    let release: () => void = () => undefined;

    const running = first.run(1, async () => {
      order.push('first start');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push('first end');
    });

    const waiting = second.run(1, async () => {
      order.push('second start');
    });

    // Let the second pacer see the lease and sleep once.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).toEqual(['first start']);

    release();
    await running;
    await waiting;

    expect(order).toEqual(['first start', 'first end', 'second start']);
  });

  it('releases the account when the action fails', async () => {
    const pacer = makePacer();

    await expect(
      pacer.run(1, async () => {
        throw new Error('the site did not answer');
      }),
    ).rejects.toThrow('the site did not answer');

    clock += MIN_DELAY_MS;
    await expect(pacer.run(1, async () => 'next')).resolves.toBe('next');
    expect(sleeps).toEqual([]);
  });

  it('does not wait behind a lease whose process has stopped', async () => {
    // A process id that is not running. Its lease must not block the account.
    database.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
      'pace.1',
      JSON.stringify({ leaseUntil: Date.now() + 60_000, owner: '999999999:abc', lastEnd: 0 }),
    ]);
    const pacer = new SqliteRequestPacer({ database, minDelayMs: 0 });

    await expect(pacer.run(1, async () => 'ran')).resolves.toBe('ran');
  });

  it('announces a wait once when it has to wait for another request', async () => {
    const first = new SqliteRequestPacer({ database, minDelayMs: 0 });
    const announced: WaitReason[] = [];
    const second = new SqliteRequestPacer({
      database,
      minDelayMs: 0,
      onWait: (reason) => {
        announced.push(reason);
      },
    });
    let release: () => void = () => undefined;

    const running = first.run(1, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const waiting = second.run(1, async () => undefined);

    await new Promise((resolve) => setTimeout(resolve, 5));
    release();
    await running;
    await waiting;

    expect(announced).toEqual(['busy']);
  });

  it('says that it waits for the minimum delay, with the time left, when nothing else runs', async () => {
    const calls: Array<[WaitReason, number]> = [];
    const pacer = new SqliteRequestPacer({
      database,
      minDelayMs: MIN_DELAY_MS,
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      onWait: (reason, waitMs) => {
        calls.push([reason, waitMs]);
      },
    });
    await pacer.run(1, async () => undefined);

    await pacer.run(1, async () => undefined);

    expect(calls).toEqual([['delay', MIN_DELAY_MS]]);
  });

  it('does not announce anything when there is no wait', async () => {
    const calls: WaitReason[] = [];
    const pacer = new SqliteRequestPacer({
      database,
      minDelayMs: MIN_DELAY_MS,
      now: () => clock,
      onWait: (reason) => {
        calls.push(reason);
      },
    });

    await pacer.run(1, async () => undefined);
    await pacer.run(2, async () => undefined);

    expect(calls).toEqual([]);
  });
});

describe('waitMessage', () => {
  it('names the other request when the account is busy', () => {
    expect(waitMessage('busy', 3_000)).toBe(
      'Waiting for another request on this account to finish.',
    );
  });

  it('gives the seconds, rounded up and never below one, for the minimum delay', () => {
    expect(waitMessage('delay', 9_200)).toBe(
      'Waiting 10 seconds before the next request to this account.',
    );
    expect(waitMessage('delay', 1)).toBe(
      'Waiting 1 seconds before the next request to this account.',
    );
  });
});
