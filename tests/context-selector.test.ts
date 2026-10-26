import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrationsFolder } from '../src/app/services.js';
import {
  ContextSelector,
  estimateTokens,
  SYSTEM_NOTE,
  type ContextBudget,
} from '../src/context/context-selector.js';
import { ContextStore } from '../src/context/context-store.js';
import { SqliteDatabase } from '../src/store/database.js';
import { loadMigrations, runMigrations } from '../src/store/migrate.js';

const budget: ContextBudget = {
  maxTokens: 4_000,
  recentMessages: 6,
  snippets: 3,
};

let tempDir: string;
let database: SqliteDatabase;
let store: ContextStore;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-selector-'));
  database = new SqliteDatabase(path.join(tempDir, 'gauntlet.db'));
  runMigrations(database, await loadMigrations(migrationsFolder()));
  store = new ContextStore(database);
});

afterEach(async () => {
  database.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe('ContextSelector', () => {
  it('holds the system note, the summary, recent messages, and snippets', () => {
    const conversationId = seedConversation(store);
    const selector = new ContextSelector({ store, budget });

    const selected = selector.select({
      conversationId,
      task: 'Tell me more about the quasar.',
      class: 'standard',
    });

    expect(selected.systemNote).toBe(SYSTEM_NOTE);
    expect(selected.summary).toContain('process and a thread');
    expect(selected.recentMessages).toHaveLength(6);
    expect(selected.snippets.length).toBeGreaterThan(0);
    expect(selected.snippets.some((message) => message.content.includes('quasar'))).toBe(true);
    expect(selected.text).toContain(SYSTEM_NOTE);
    expect(selected.text).toContain('process and a thread');
    expect(selected.text).toContain('Recent messages:');
    expect(selected.text).toContain('Older snippets:');
    expect(selected.text).toContain('quasar');
    expect(selected.tokens).toBe(estimateTokens(selected.text));
  });

  it('keeps the context inside the budget', () => {
    const conversation = store.createConversation('A large conversation');

    store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'A'.repeat(2_000),
    });
    store.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'B'.repeat(2_000),
    });
    store.saveSummary(conversation.id, 'C'.repeat(2_000));

    const selector = new ContextSelector({
      store,
      budget: { maxTokens: 80, recentMessages: 6, snippets: 3 },
    });

    const selected = selector.select({
      conversationId: conversation.id,
      task: 'A short task.',
      class: 'hard',
    });

    expect(selected.tokens).toBeLessThanOrEqual(80);
    expect(selected.summary).toBeUndefined();
    expect(selected.recentMessages).toHaveLength(0);
  });

  it('gives a simple task less context than a standard task', () => {
    const conversationId = seedConversation(store);
    const selector = new ContextSelector({ store, budget });
    const task = 'Tell me more about the quasar.';

    const simple = selector.select({ conversationId, task, class: 'simple' });
    const standard = selector.select({ conversationId, task, class: 'standard' });
    const hard = selector.select({ conversationId, task, class: 'hard' });

    expect(simple.recentMessages.length).toBeLessThan(standard.recentMessages.length);
    expect(simple.snippets).toHaveLength(0);
    expect(simple.snippets.length).toBeLessThan(hard.snippets.length);
    expect(simple.tokens).toBeLessThan(standard.tokens);
    expect(standard.tokens).toBeLessThan(hard.tokens);
  });

  it('sends a task that is larger than the budget with no history', () => {
    const conversation = store.createConversation();
    store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Earlier question.',
    });
    const selector = new ContextSelector({
      store,
      budget: { maxTokens: 40, recentMessages: 6, snippets: 3 },
    });

    const selected = selector.select({
      conversationId: conversation.id,
      task: 'A short task.',
      class: 'simple',
    });

    expect(selected.text).toBe('A short task.');
    expect(selected.recentMessages).toEqual([]);
    expect(selected.snippets).toEqual([]);
  });
});

/** Add a summary, two old keyword messages, and eight recent messages. */
function seedConversation(contextStore: ContextStore): number {
  const conversation = contextStore.createConversation('Context test');

  const oldMessage = contextStore.addMessage({
    conversationId: conversation.id,
    role: 'user',
    content: 'The old note mentions a quasar.',
  });
  contextStore.addMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: 'The old answer explains the quasar.',
  });

  for (let index = 0; index < 8; index += 1) {
    contextStore.addMessage({
      conversationId: conversation.id,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Recent message ${String(index)} about a process.`,
    });
  }

  contextStore.saveSummary(
    conversation.id,
    'The user asked about a process and a thread.',
    oldMessage.id,
  );

  return conversation.id;
}
