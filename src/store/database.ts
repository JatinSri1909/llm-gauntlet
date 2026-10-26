import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite';

import { StoreError } from '../core/errors.js';

/** A value that goes into a query. */
export type SqlValue = SQLInputValue;

/** A row that comes out of a query. */
export type SqlRow = Record<string, SQLOutputValue>;

/** The local store database. It uses the built-in `node:sqlite` module. */
export class SqliteDatabase {
  /** The path of the database file. */
  readonly filePath: string;

  private readonly handle: DatabaseSync;
  private isClosed = false;

  constructor(filePath: string) {
    this.filePath = filePath;

    try {
      mkdirSync(path.dirname(filePath), { recursive: true });
      // The module loads here and not at import time. A command line entry point can hide the
      // experimental notice first (see src/cli/quiet-sqlite-warning.ts).
      const { DatabaseSync: Database } = process.getBuiltinModule('node:sqlite');
      this.handle = new Database(filePath);
      this.handle.exec('PRAGMA journal_mode = WAL;');
      this.handle.exec('PRAGMA foreign_keys = ON;');
      this.handle.exec('PRAGMA busy_timeout = 5000;');
    } catch (error) {
      throw new StoreError(`Cannot open the database: ${filePath}`, {
        hint: 'Check that the data folder exists and that you can write to it.',
        cause: error,
      });
    }
  }

  /** Run one statement that returns no rows. It returns the number of changed rows. */
  run(sql: string, params: readonly SqlValue[] = []): number {
    const result = this.handle.prepare(sql).run(...[...params]);
    return Number(result.changes);
  }

  /** Run one statement and return the first row. */
  get<T extends SqlRow>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    const row = this.handle.prepare(sql).get(...[...params]);
    return row as T | undefined;
  }

  /** Run one statement and return every row. */
  all<T extends SqlRow>(sql: string, params: readonly SqlValue[] = []): T[] {
    return this.handle.prepare(sql).all(...[...params]) as T[];
  }

  /** Run many statements in one call. */
  exec(sql: string): void {
    this.handle.exec(sql);
  }

  /** Run an action in one transaction. Roll back when it fails. */
  transaction<T>(action: () => T): T {
    this.exec('BEGIN');
    try {
      const result = action();
      this.exec('COMMIT');
      return result;
    } catch (error) {
      this.exec('ROLLBACK');
      throw error;
    }
  }

  /** Close the database. Closing twice is safe. */
  close(): void {
    if (!this.isClosed) {
      this.isClosed = true;
      this.handle.close();
    }
  }
}
