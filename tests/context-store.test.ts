import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrationsFolder } from '../src/app/services.js';
import { ContextStore } from '../src/context/context-store.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

let tempDir: string;
let database: SqliteDatabase;
let store: ContextStore;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-context-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  store = new ContextStore(database);
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe('ContextStore', () => {
  it('saves messages and loads the last messages in order', () => {
    const conversation = store.createConversation('A test chat');

    store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'First question.',
    });
    store.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'First answer.',
      class: 'simple',
    });
    store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Second question.',
    });

    const last = store.lastMessages(conversation.id, 2);

    expect(last).toHaveLength(2);
    expect(last.map((message) => message.content)).toEqual(['First answer.', 'Second question.']);
    expect(last[0]?.role).toBe('assistant');
    expect(last[0]?.class).toBe('simple');
  });

  it('saves a summary and loads the latest summary', () => {
    const conversation = store.createConversation();
    const message = store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'A question about a process.',
    });

    const first = store.saveSummary(conversation.id, 'The first summary.', message.id);
    const second = store.saveSummary(conversation.id, 'The second summary.');

    expect(store.latestSummary(conversation.id)).toEqual(second);
    expect(first.content).toBe('The first summary.');
    expect(first.lastMessageId).toBe(message.id);
  });

  it('finds an old message by keyword', () => {
    const conversation = store.createConversation();

    store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'The early note mentions a quasar.',
    });
    store.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'The later note mentions the weather.',
    });

    const found = store.searchMessages(conversation.id, 'quasar');

    expect(found).toHaveLength(1);
    expect(found[0]?.content).toContain('quasar');
  });

  it('keeps a search inside one conversation', () => {
    const first = store.createConversation('First');
    const second = store.createConversation('Second');

    store.addMessage({
      conversationId: first.id,
      role: 'user',
      content: 'A quasar in the first chat.',
    });
    store.addMessage({
      conversationId: second.id,
      role: 'user',
      content: 'A quasar in the second chat.',
    });

    const found = store.searchMessages(first.id, 'quasar');

    expect(found).toHaveLength(1);
    expect(found[0]?.content).toContain('first chat');
  });

  it('lists conversations newest first', () => {
    const first = store.createConversation('First');
    const second = store.createConversation('Second');

    expect(store.listConversations().map((conversation) => conversation.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(store.getConversation(first.id)?.title).toBe('First');
    expect(store.getConversation(9999)).toBeUndefined();
  });

  it('rejects an empty message and a missing conversation', () => {
    const conversation = store.createConversation();

    expect(() =>
      store.addMessage({ conversationId: conversation.id, role: 'user', content: '   ' }),
    ).toThrow(/empty/);
    expect(() =>
      store.addMessage({ conversationId: 9999, role: 'user', content: 'A message.' }),
    ).toThrow(/does not exist/);
  });

  it('rejects a summary that points to another conversation', () => {
    const first = store.createConversation('First');
    const second = store.createConversation('Second');
    const message = store.addMessage({
      conversationId: second.id,
      role: 'user',
      content: 'A message in the second chat.',
    });

    expect(() => store.saveSummary(first.id, 'A summary.', message.id)).toThrow(
      /same conversation/,
    );
  });

  it('ignores a search with no words', () => {
    const conversation = store.createConversation();

    store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'A message about winter.',
    });

    expect(store.searchMessages(conversation.id, '   ')).toEqual([]);
    expect(store.searchMessages(conversation.id, '"')).toEqual([]);
  });
});
