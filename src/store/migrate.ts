import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { StoreError } from '../core/errors.js';
import type { SqliteDatabase } from './database.js';

/** One schema change. */
export interface Migration {
  /** The name of the migration file without the extension. */
  readonly id: string;
  /** The SQL of the migration. */
  readonly sql: string;
}

/** The result of one migration run. */
export interface MigrationResult {
  /** The migrations that ran in this call. */
  readonly applied: readonly string[];
  /** The migrations that were already applied. */
  readonly skipped: readonly string[];
}

const MIGRATIONS_TABLE = 'schema_migrations';

/** Read the migration files of a folder in name order. */
export async function loadMigrations(folderPath: string): Promise<Migration[]> {
  if (!existsSync(folderPath)) {
    return [];
  }

  let names: string[];
  try {
    names = await readdir(folderPath);
  } catch (error) {
    throw new StoreError(`Cannot read the migrations folder: ${folderPath}`, {
      hint: 'Check that the folder exists and that you can read it.',
      cause: error,
    });
  }

  const migrations: Migration[] = [];
  for (const name of names.filter((fileName) => fileName.endsWith('.sql')).sort()) {
    const sql = await readFile(path.join(folderPath, name), 'utf8');
    migrations.push({ id: name.replace(/\.sql$/, ''), sql });
  }

  return migrations;
}

/** Apply the migrations that are not in the database yet. */
export function runMigrations(
  database: SqliteDatabase,
  migrations: readonly Migration[],
): MigrationResult {
  database.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );

  const knownIds = new Set(
    database.all<{ id: string }>(`SELECT id FROM ${MIGRATIONS_TABLE}`).map((row) => row.id),
  );

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (knownIds.has(migration.id)) {
      skipped.push(migration.id);
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      database.run(`INSERT INTO ${MIGRATIONS_TABLE} (id, applied_at) VALUES (?, ?)`, [
        migration.id,
        new Date().toISOString(),
      ]);
    });

    knownIds.add(migration.id);
    applied.push(migration.id);
  }

  return { applied, skipped };
}
