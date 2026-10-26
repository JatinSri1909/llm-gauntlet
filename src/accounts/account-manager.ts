import { AppError } from '../core/errors.js';
import type { SqliteDatabase, SqlRow } from '../store/database.js';

/** The state of an account. */
export type AccountState = 'needs_login' | 'ready' | 'cooling_down' | 'blocked';

/** One account of the user on one provider. */
export interface Account {
  readonly id: number;
  readonly provider: string;
  readonly label: string;
  readonly state: AccountState;
  readonly coolingUntil: Date | undefined;
  readonly createdAt: string;
}

/** A new account. */
export interface NewAccount {
  readonly provider: string;
  readonly label: string;
}

interface AccountRow extends SqlRow {
  id: number;
  provider: string;
  label: string;
  state: string;
  cooling_until: string | null;
  created_at: string;
}

/** Add, list, and remove accounts. */
export class AccountManager {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  /** Add an account. It returns the account with its new id. */
  add(newAccount: NewAccount): Account {
    const provider = newAccount.provider.trim().toLowerCase();
    const label = newAccount.label.trim();

    if (provider === '') {
      throw new AppError('ACCOUNT_INVALID', 'The provider name is empty.', {
        hint: 'Use the name of the provider. Example: claude.',
      });
    }

    if (label === '') {
      throw new AppError('ACCOUNT_INVALID', 'The account label is empty.', {
        hint: 'Use a label that tells the accounts apart. Example: student-one.',
      });
    }

    const existing = this.find(provider, label);
    if (existing !== undefined) {
      throw new AppError('ACCOUNT_EXISTS', `The account already exists: ${provider} ${label}`, {
        hint: 'Use another label for the second account of the same provider.',
      });
    }

    this.database.run('INSERT INTO accounts (provider, label) VALUES (?, ?)', [provider, label]);

    const row = this.database.get<AccountRow>(
      'SELECT id, provider, label, state, cooling_until, created_at FROM accounts WHERE provider = ? AND label = ?',
      [provider, label],
    );

    if (row === undefined) {
      throw new AppError('ACCOUNT_MISSING', `The account was not saved: ${provider} ${label}`);
    }

    return toAccount(row);
  }

  /** Return every account. */
  list(): Account[] {
    const rows = this.database.all<AccountRow>(
      'SELECT id, provider, label, state, cooling_until, created_at FROM accounts ORDER BY provider, label',
    );

    return rows.map(toAccount);
  }

  /** Return one account by its id. */
  get(id: number): Account | undefined {
    const row = this.database.get<AccountRow>(
      'SELECT id, provider, label, state, cooling_until, created_at FROM accounts WHERE id = ?',
      [id],
    );

    return row === undefined ? undefined : toAccount(row);
  }

  /** Return one account by its provider and label. */
  find(provider: string, label: string): Account | undefined {
    const row = this.database.get<AccountRow>(
      'SELECT id, provider, label, state, cooling_until, created_at FROM accounts WHERE provider = ? AND label = ?',
      [provider.trim().toLowerCase(), label.trim()],
    );

    return row === undefined ? undefined : toAccount(row);
  }

  /** Remove an account. It returns true when an account was removed. */
  remove(id: number): boolean {
    const changes = this.database.run('DELETE FROM accounts WHERE id = ?', [id]);
    // The pacer keeps one state row for each account. The row goes with the account.
    this.database.run('DELETE FROM settings WHERE key = ?', [`pace.${String(id)}`]);
    return changes > 0;
  }

  /** Change the state of an account. */
  setState(id: number, state: AccountState, coolingUntil?: Date): void {
    this.database.run('UPDATE accounts SET state = ?, cooling_until = ? WHERE id = ?', [
      state,
      coolingUntil?.toISOString() ?? null,
      id,
    ]);
  }
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    state: row.state as AccountState,
    coolingUntil: row.cooling_until === null ? undefined : new Date(row.cooling_until),
    createdAt: row.created_at,
  };
}
