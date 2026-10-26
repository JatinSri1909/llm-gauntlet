import { randomBytes } from 'node:crypto';

import type { SqliteDatabase } from '../store/database.js';

/** The longest time that one request may hold an account. It covers the answer time limit. */
const LEASE_MS = 10 * 60 * 1000;
/** The longest sleep between two checks of the lease. */
const POLL_MS = 1000;

/** The state that the pacer keeps for one account in the settings table. */
interface PaceState {
  /** The time when the current request must be finished. */
  readonly leaseUntil: number;
  /** The owner of the current lease. */
  readonly owner: string;
  /** The time when the last request ended. */
  readonly lastEnd: number;
}

/** The inputs of the pacer. The tests replace the clock and the sleep. */
export interface RequestPacerOptions {
  readonly database: SqliteDatabase;
  /** The minimum time between two requests to one account, in milliseconds. */
  readonly minDelayMs: number;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/** Run one request for an account. Only one request runs at a time for an account. */
export interface RequestPacer {
  run<T>(accountId: number, action: () => Promise<T>): Promise<T>;
}

/**
 * Keep one request at a time for each account, across processes, and wait a minimum time
 * between two requests. The state is in the settings table of the local store.
 */
export class SqliteRequestPacer implements RequestPacer {
  private readonly options: RequestPacerOptions;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: RequestPacerOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async run<T>(accountId: number, action: () => Promise<T>): Promise<T> {
    const owner = randomBytes(8).toString('hex');
    await this.acquire(accountId, owner);

    try {
      return await action();
    } finally {
      this.release(accountId, owner);
    }
  }

  private async acquire(accountId: number, owner: string): Promise<void> {
    for (;;) {
      const waitMs = this.tryAcquire(accountId, owner);
      if (waitMs === 0) {
        return;
      }

      await this.sleep(Math.min(waitMs, POLL_MS));
    }
  }

  /** Take the lease when the account is free and the minimum delay has passed. Otherwise return the wait. */
  private tryAcquire(accountId: number, owner: string): number {
    return this.inImmediateTransaction(() => {
      const now = this.now();
      const state = this.readState(accountId);

      if (state.leaseUntil > now) {
        return state.leaseUntil - now;
      }

      const readyAt = state.lastEnd + this.options.minDelayMs;
      if (readyAt > now) {
        return readyAt - now;
      }

      this.writeState(accountId, { leaseUntil: now + LEASE_MS, owner, lastEnd: state.lastEnd });
      return 0;
    });
  }

  private release(accountId: number, owner: string): void {
    this.inImmediateTransaction(() => {
      const state = this.readState(accountId);
      if (state.owner === owner) {
        this.writeState(accountId, { leaseUntil: 0, owner: '', lastEnd: this.now() });
      }
      return undefined;
    });
  }

  private readState(accountId: number): PaceState {
    const row = this.options.database.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [paceKey(accountId)],
    );

    if (row === undefined) {
      return { leaseUntil: 0, owner: '', lastEnd: 0 };
    }

    const parsed = JSON.parse(row.value) as Partial<PaceState>;
    return {
      leaseUntil: parsed.leaseUntil ?? 0,
      owner: parsed.owner ?? '',
      lastEnd: parsed.lastEnd ?? 0,
    };
  }

  private writeState(accountId: number, state: PaceState): void {
    this.options.database.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [paceKey(accountId), JSON.stringify(state)],
    );
  }

  /** Run the action in a write transaction. The write lock is taken at the start, so two processes cannot both take the lease. */
  private inImmediateTransaction<T>(action: () => T): T {
    this.options.database.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.options.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.options.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function paceKey(accountId: number): string {
  return `pace.${String(accountId)}`;
}
