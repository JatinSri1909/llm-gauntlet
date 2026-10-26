import type { Account, AccountManager, AccountState } from '../accounts/account-manager.js';
import { AppError } from '../core/errors.js';
import type { SqliteDatabase, SqlRow } from '../store/database.js';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/** The counts of requests and tokens for one account in the rolling window. */
export interface UsageTotals {
  readonly requests: number;
  readonly tokens: number;
}

/** The usage and the state of one account. */
export interface AccountUsage {
  readonly account: Account;
  readonly totals: UsageTotals;
  readonly state: AccountState;
}

/** The options of the usage tracker. */
export interface UsageTrackerOptions {
  readonly database: SqliteDatabase;
  readonly accounts: AccountManager;
  /** The length of the rolling window in hours. */
  readonly windowHours: number;
  /** The clock. The tests replace it. */
  readonly now?: () => Date;
}

interface TotalsRow extends SqlRow {
  requests: number;
  tokens: number;
}

/** Count requests and tokens for each account. Set the cooling down state after a limit. */
export class UsageTracker {
  private readonly database: SqliteDatabase;
  private readonly accounts: AccountManager;
  private readonly windowMilliseconds: number;
  private readonly now: () => Date;

  constructor(options: UsageTrackerOptions) {
    if (!Number.isFinite(options.windowHours) || options.windowHours <= 0) {
      throw new AppError('USAGE_INVALID', 'The usage window must be a positive number of hours.', {
        hint: 'Set usage.windowHours in the config file to a positive number.',
      });
    }

    this.database = options.database;
    this.accounts = options.accounts;
    this.windowMilliseconds = options.windowHours * MILLISECONDS_PER_HOUR;
    this.now = options.now ?? (() => new Date());
  }

  /** Record one request that an account answered. */
  recordRequest(accountId: number, model: string, tokens: number): void {
    if (!Number.isInteger(tokens) || tokens < 0) {
      throw new AppError('USAGE_INVALID', 'The token count must be a whole number, zero or more.', {
        hint: 'Count the tokens of the request and the answer before you record them.',
      });
    }

    this.database.run(
      'INSERT INTO usage_records (account_id, model, tokens, created_at) VALUES (?, ?, ?, ?)',
      [accountId, model, tokens, this.now().toISOString()],
    );
  }

  /**
   * Set an account to cooling down after a limit message. The account stays cooling down until
   * the reset time. A missing or past reset time uses the length of the window instead.
   * It returns the time when the account is ready again.
   */
  recordLimit(accountId: number, resetAt?: Date): Date {
    const account = this.accounts.get(accountId);
    if (account === undefined) {
      throw new AppError('ACCOUNT_MISSING', `The account does not exist: ${String(accountId)}`, {
        hint: 'Run "gauntlet accounts" to see the accounts.',
      });
    }

    const now = this.now();
    const coolingUntil =
      resetAt !== undefined && resetAt.getTime() > now.getTime()
        ? resetAt
        : new Date(now.getTime() + this.windowMilliseconds);

    this.accounts.setState(accountId, 'cooling_down', coolingUntil);
    return coolingUntil;
  }

  /**
   * Return the state of an account. An account that is cooling down becomes ready once its
   * reset time passes. The change is saved.
   */
  refreshState(accountId: number): AccountState {
    const account = this.accounts.get(accountId);
    if (account === undefined) {
      throw new AppError('ACCOUNT_MISSING', `The account does not exist: ${String(accountId)}`, {
        hint: 'Run "gauntlet accounts" to see the accounts.',
      });
    }

    if (account.state !== 'cooling_down') {
      return account.state;
    }

    // A cooling down account always has a reset time. A missing time means the wait is over.
    const isPassed =
      account.coolingUntil === undefined || account.coolingUntil.getTime() <= this.now().getTime();
    if (!isPassed) {
      return 'cooling_down';
    }

    this.accounts.setState(accountId, 'ready');
    return 'ready';
  }

  /** Return true when the account can take a request now. */
  isReady(accountId: number): boolean {
    return this.refreshState(accountId) === 'ready';
  }

  /** Return the request and token counts of one account in the rolling window. */
  totals(accountId: number): UsageTotals {
    const since = new Date(this.now().getTime() - this.windowMilliseconds).toISOString();
    const row = this.database.get<TotalsRow>(
      `SELECT COUNT(*) AS requests, COALESCE(SUM(tokens), 0) AS tokens
       FROM usage_records WHERE account_id = ? AND created_at >= ?`,
      [accountId, since],
    );

    return { requests: Number(row?.requests ?? 0), tokens: Number(row?.tokens ?? 0) };
  }

  /** Return the usage and the state of every account. */
  summaries(): AccountUsage[] {
    return this.accounts.list().map((account) => ({
      account,
      totals: this.totals(account.id),
      state: this.refreshState(account.id),
    }));
  }
}
