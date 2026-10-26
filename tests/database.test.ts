import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

let tempDir: string;
let database: SqliteDatabase;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-store-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe('local store database', () => {
  it('creates the database file in the folder', () => {
    expect(existsSync(path.join(tempDir, 'gauntlet.db'))).toBe(true);
  });

  it('applies a migration and records it', () => {
    const migrations = [
      {
        id: '001-test',
        sql: 'CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      },
    ];

    const result = runMigrations(database, migrations);

    expect(result.applied).toEqual(['001-test']);
    expect(result.skipped).toEqual([]);

    const row = database.get<{ count: number }>('SELECT count(*) AS count FROM test_table');
    expect(row?.count).toBe(0);
  });

  it('changes nothing on the second run', () => {
    const migrations = [
      {
        id: '001-test',
        sql: 'CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      },
    ];

    runMigrations(database, migrations);
    const second = runMigrations(database, migrations);

    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['001-test']);

    const rows = database.all<{ id: string }>('SELECT id FROM schema_migrations');
    expect(rows).toHaveLength(1);
  });

  it('rolls back a transaction that fails', () => {
    expect(() =>
      database.transaction(() => {
        database.run('CREATE TABLE rollback_table (id INTEGER)');
        throw new Error('stop');
      }),
    ).toThrow('stop');

    const row = database.get<{ count: number }>(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'rollback_table'",
    );
    expect(row?.count).toBe(0);
  });

  it('reads the migration files in name order', async () => {
    const folder = path.join(tempDir, 'migrations');
    await mkdir(folder);
    await writeFile(path.join(folder, '002-second.sql'), 'CREATE TABLE second (id INTEGER);');
    await writeFile(path.join(folder, '001-first.sql'), 'CREATE TABLE first (id INTEGER);');

    const migrations = await loadMigrations(folder);

    expect(migrations.map((migration) => migration.id)).toEqual(['001-first', '002-second']);
    expect(migrations[0]?.sql).toContain('first');
  });

  it('gives no migrations when the folder does not exist', async () => {
    const migrations = await loadMigrations(path.join(tempDir, 'missing'));

    expect(migrations).toEqual([]);
  });
});
