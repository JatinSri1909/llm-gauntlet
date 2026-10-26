import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'store',
  'migrations',
);

let tempDir: string;
let database: SqliteDatabase;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-schema-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder));
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

function addAccount(provider = 'claude', label = 'student-one'): number {
  database.run('INSERT INTO accounts (provider, label) VALUES (?, ?)', [provider, label]);
  const row = database.get<{ id: number }>('SELECT last_insert_rowid() AS id');
  return row?.id ?? 0;
}

function addConversation(title = 'Test conversation'): number {
  database.run('INSERT INTO conversations (title) VALUES (?)', [title]);
  const row = database.get<{ id: number }>('SELECT last_insert_rowid() AS id');
  return row?.id ?? 0;
}

describe('schema version 1', () => {
  it('runs the migration two times and changes nothing the second time', async () => {
    await expect(loadMigrations(migrationsFolder)).resolves.toHaveLength(1);

    const second = runMigrations(database, await loadMigrations(migrationsFolder));

    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['001-initial']);
  });

  it('creates each table', () => {
    const names = database
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'accounts',
        'conversations',
        'messages',
        'messages_fts',
        'settings',
        'summaries',
        'usage_records',
      ]),
    );
  });

  it('inserts and reads one row in each table', () => {
    const accountId = addAccount();
    const conversationId = addConversation();

    database.run(
      'INSERT INTO messages (conversation_id, account_id, role, content, "class") VALUES (?, ?, ?, ?, ?)',
      [conversationId, accountId, 'assistant', 'A short answer.', 'simple'],
    );
    const message = database.get<{ content: string; class: string }>(
      'SELECT content, "class" AS "class" FROM messages WHERE conversation_id = ?',
      [conversationId],
    );

    database.run(
      'INSERT INTO summaries (conversation_id, content, last_message_id) VALUES (?, ?, ?)',
      [conversationId, 'The summary.', 1],
    );
    const summary = database.get<{ content: string }>('SELECT content FROM summaries');

    database.run('INSERT INTO usage_records (account_id, model, tokens) VALUES (?, ?, ?)', [
      accountId,
      'claude-sonnet',
      120,
    ]);
    const usage = database.get<{ tokens: number }>('SELECT tokens FROM usage_records');

    database.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['localOnly', 'false']);
    const setting = database.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
      'localOnly',
    ]);

    expect(message).toEqual({ content: 'A short answer.', class: 'simple' });
    expect(summary?.content).toBe('The summary.');
    expect(usage?.tokens).toBe(120);
    expect(setting?.value).toBe('false');
  });

  it('finds a message with the FTS5 index', () => {
    const conversationId = addConversation();

    database.run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [
      conversationId,
      'user',
      'Explain the difference between a process and a thread.',
    ]);
    database.run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [
      conversationId,
      'user',
      'Write a short poem about winter.',
    ]);

    const rows = database.all<{ content: string }>(
      'SELECT m.content AS content FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid WHERE messages_fts MATCH ?',
      ['thread'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toContain('process and a thread');
  });

  it('keeps the FTS index in step when a message is deleted or updated', () => {
    const conversationId = addConversation();
    database.run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [
      conversationId,
      'user',
      'an old token about winter',
    ]);
    const row = database.get<{ id: number }>('SELECT id FROM messages');
    const messageId = row?.id ?? 0;

    database.run('UPDATE messages SET content = ? WHERE id = ?', [
      'a new word about summer',
      messageId,
    ]);
    database.run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [
      conversationId,
      'user',
      'a message about autumn',
    ]);
    const deleted = database.get<{ id: number }>('SELECT id FROM messages WHERE content = ?', [
      'a message about autumn',
    ]);
    database.run('DELETE FROM messages WHERE id = ?', [deleted?.id ?? 0]);

    const oldMatch = database.all('SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?', [
      'winter',
    ]);
    const newMatch = database.all('SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?', [
      'summer',
    ]);
    const deleteMatch = database.all('SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?', [
      'autumn',
    ]);

    expect(oldMatch).toHaveLength(0);
    expect(newMatch).toHaveLength(1);
    expect(deleteMatch).toHaveLength(0);
  });

  it('rejects an account in an unknown state', () => {
    expect(() =>
      database.run('INSERT INTO accounts (provider, label, state) VALUES (?, ?, ?)', [
        'claude',
        'bad-state',
        'sleeping',
      ]),
    ).toThrow();
  });

  it('rejects a message without a conversation', () => {
    expect(() =>
      database.run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [
        9999,
        'user',
        'orphan',
      ]),
    ).toThrow();
  });

  it('deletes the messages of a deleted conversation', () => {
    const conversationId = addConversation();
    database.run('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [
      conversationId,
      'user',
      'gone soon',
    ]);

    database.run('DELETE FROM conversations WHERE id = ?', [conversationId]);

    expect(database.all('SELECT id FROM messages')).toHaveLength(0);
  });
});
