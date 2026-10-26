import type { SqliteDatabase } from '../store/database.js';

/** The text that the user must type to accept the risk. */
export const RISK_NOTICE_CONFIRMATION = 'I accept the risk';

/** The settings key that records the typed confirmation. */
const RISK_NOTICE_KEY = 'riskNotice.confirmed';

/** The notice that the user reads before the first login. */
export const RISK_NOTICE_TEXT = [
  'Risk notice',
  '',
  'Platform terms can forbid automated access. An account can be suspended.',
  'llm-gauntlet sends one request at a time to each account. It waits a minimum time',
  'between requests. It does not hide the automation.',
  'Use only accounts that you can afford to lose.',
].join('\n');

/** The input and output that the risk notice needs. */
export interface RiskNoticeIo {
  /** Show one line of text to the user. */
  write(text: string): void;
  /** Ask the user one question and return the answer. */
  ask(question: string): Promise<string>;
}

/** The store for the typed confirmation. */
export interface RiskNoticeStore {
  /** Return true when the user already accepted the risk. */
  hasConfirmed(): boolean;
  /** Save the typed confirmation on the local machine. */
  save(confirmation: string): void;
}

/** The settings-backed store for the typed confirmation. */
export class SqliteRiskNoticeStore implements RiskNoticeStore {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  /** Return true when the saved confirmation matches the required text. */
  hasConfirmed(): boolean {
    const row = this.database.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
      RISK_NOTICE_KEY,
    ]);

    return row?.value === RISK_NOTICE_CONFIRMATION;
  }

  /** Save the typed confirmation in the settings table. */
  save(confirmation: string): void {
    this.database.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [RISK_NOTICE_KEY, confirmation],
    );
  }
}

/** The inputs that the risk notice reads. */
export interface RiskNoticeOptions {
  readonly store: RiskNoticeStore;
  readonly io: RiskNoticeIo;
}

/**
 * Show the risk notice before the first login.
 * It returns true when the login may start.
 */
export async function showRiskNotice(options: RiskNoticeOptions): Promise<boolean> {
  if (options.store.hasConfirmed()) {
    return true;
  }

  options.io.write(RISK_NOTICE_TEXT);

  const answer = await options.io.ask(`Type "${RISK_NOTICE_CONFIRMATION}" to accept the risk: `);
  const confirmation = answer.trim();

  if (confirmation !== RISK_NOTICE_CONFIRMATION) {
    options.io.write('Login stopped. The risk notice was not accepted.');
    return false;
  }

  options.store.save(confirmation);
  return true;
}
