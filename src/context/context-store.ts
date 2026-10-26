import { AppError } from '../core/errors.js';
import type { DifficultyClass } from '../core/config-schema.js';
import type { SqliteDatabase, SqlRow } from '../store/database.js';

/** The role of a message. */
export type MessageRole = 'user' | 'assistant' | 'system';

/** One conversation in the local store. */
export interface Conversation {
  readonly id: number;
  readonly title: string | undefined;
  readonly createdAt: string;
}

/** One message in a conversation. */
export interface Message {
  readonly id: number;
  readonly conversationId: number;
  readonly accountId: number | undefined;
  readonly role: MessageRole;
  readonly content: string;
  readonly class: DifficultyClass | undefined;
  readonly createdAt: string;
}

/** One rolling summary of a conversation. */
export interface Summary {
  readonly id: number;
  readonly conversationId: number;
  readonly content: string;
  readonly lastMessageId: number | undefined;
  readonly createdAt: string;
}

/** A new message. */
export interface NewMessage {
  readonly conversationId: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly accountId?: number;
  readonly class?: DifficultyClass;
}

interface ConversationRow extends SqlRow {
  id: number;
  title: string | null;
  created_at: string;
}

interface MessageRow extends SqlRow {
  id: number;
  conversation_id: number;
  account_id: number | null;
  role: string;
  content: string;
  class: string | null;
  created_at: string;
}

interface SummaryRow extends SqlRow {
  id: number;
  conversation_id: number;
  content: string;
  last_message_id: number | null;
  created_at: string;
}

const MESSAGE_COLUMNS =
  'm.id, m.conversation_id, m.account_id, m.role, m.content, m."class", m.created_at';

/** Save and load conversations, messages, and summaries. Search messages with FTS5. */
export class ContextStore {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  /** Make a conversation. The title is optional. */
  createConversation(title?: string): Conversation {
    const trimmed = title?.trim() ?? '';
    const value = trimmed === '' ? null : trimmed;

    this.database.run('INSERT INTO conversations (title) VALUES (?)', [value]);
    const row = this.database.get<ConversationRow>(
      'SELECT id, title, created_at FROM conversations WHERE id = last_insert_rowid()',
    );

    if (row === undefined) {
      throw new AppError('CONVERSATION_MISSING', 'The conversation was not saved.');
    }

    return toConversation(row);
  }

  /** Return every conversation, newest first. */
  listConversations(): Conversation[] {
    const rows = this.database.all<ConversationRow>(
      'SELECT id, title, created_at FROM conversations ORDER BY id DESC',
    );

    return rows.map(toConversation);
  }

  /** Return one conversation by its id. */
  getConversation(id: number): Conversation | undefined {
    const row = this.database.get<ConversationRow>(
      'SELECT id, title, created_at FROM conversations WHERE id = ?',
      [id],
    );

    return row === undefined ? undefined : toConversation(row);
  }

  /** Add a message to a conversation. */
  addMessage(input: NewMessage): Message {
    const content = input.content.trim();
    if (content === '') {
      throw new AppError('MESSAGE_INVALID', 'The message text is empty.', {
        hint: 'Send a message with text.',
      });
    }

    if (this.getConversation(input.conversationId) === undefined) {
      throw new AppError(
        'CONVERSATION_MISSING',
        `The conversation does not exist: ${String(input.conversationId)}`,
        { hint: 'Start a new conversation and try again.' },
      );
    }

    this.database.run(
      'INSERT INTO messages (conversation_id, account_id, role, content, "class") VALUES (?, ?, ?, ?, ?)',
      [input.conversationId, input.accountId ?? null, input.role, content, input.class ?? null],
    );

    const row = this.database.get<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages m WHERE m.id = last_insert_rowid()`,
    );

    if (row === undefined) {
      throw new AppError('MESSAGE_MISSING', 'The message was not saved.');
    }

    return toMessage(row);
  }

  /** Return the last messages of a conversation, oldest first. */
  lastMessages(conversationId: number, limit = 6): Message[] {
    const rows = this.database.all<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages m WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT ?`,
      [conversationId, positiveLimit(limit, 6)],
    );

    return rows.reverse().map(toMessage);
  }

  /** Save a rolling summary. The last message id is optional. */
  saveSummary(conversationId: number, content: string, lastMessageId?: number): Summary {
    const text = content.trim();
    if (text === '') {
      throw new AppError('SUMMARY_INVALID', 'The summary text is empty.', {
        hint: 'Write a short summary before you save it.',
      });
    }

    if (this.getConversation(conversationId) === undefined) {
      throw new AppError(
        'CONVERSATION_MISSING',
        `The conversation does not exist: ${String(conversationId)}`,
        { hint: 'Start a new conversation and try again.' },
      );
    }

    if (
      lastMessageId !== undefined &&
      this.getConversationOfMessage(lastMessageId) !== conversationId
    ) {
      throw new AppError(
        'SUMMARY_INVALID',
        'The summary must point to a message of the same conversation.',
        {
          hint: 'Use a message id from this conversation.',
        },
      );
    }

    this.database.run(
      'INSERT INTO summaries (conversation_id, content, last_message_id) VALUES (?, ?, ?)',
      [conversationId, text, lastMessageId ?? null],
    );

    const row = this.database.get<SummaryRow>(
      'SELECT id, conversation_id, content, last_message_id, created_at FROM summaries WHERE id = last_insert_rowid()',
    );

    if (row === undefined) {
      throw new AppError('SUMMARY_MISSING', 'The summary was not saved.');
    }

    return toSummary(row);
  }

  /** Return the newest summary of a conversation. */
  latestSummary(conversationId: number): Summary | undefined {
    const row = this.database.get<SummaryRow>(
      'SELECT id, conversation_id, content, last_message_id, created_at FROM summaries WHERE conversation_id = ? ORDER BY id DESC LIMIT 1',
      [conversationId],
    );

    return row === undefined ? undefined : toSummary(row);
  }

  /** Find messages in a conversation with the FTS5 index. */
  searchMessages(conversationId: number, query: string, limit = 5): Message[] {
    const match = toFtsQuery(query);
    if (match === '') {
      return [];
    }

    const rows = this.database.all<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
       WHERE messages_fts MATCH ? AND m.conversation_id = ?
       ORDER BY messages_fts.rank
       LIMIT ?`,
      [match, conversationId, positiveLimit(limit, 5)],
    );

    return rows.map(toMessage);
  }

  private getConversationOfMessage(messageId: number): number | undefined {
    const row = this.database.get<{ conversation_id: number }>(
      'SELECT conversation_id FROM messages WHERE id = ?',
      [messageId],
    );

    return row?.conversation_id;
  }
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title === null ? undefined : row.title,
    createdAt: row.created_at,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    accountId: row.account_id === null ? undefined : row.account_id,
    role: row.role as MessageRole,
    content: row.content,
    class: row.class === null ? undefined : (row.class as DifficultyClass),
    createdAt: row.created_at,
  };
}

function toSummary(row: SummaryRow): Summary {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    content: row.content,
    lastMessageId: row.last_message_id === null ? undefined : row.last_message_id,
    createdAt: row.created_at,
  };
}

function positiveLimit(limit: number, fallback: number): number {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.floor(limit));
}

const STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'more',
  'my',
  'of',
  'on',
  'or',
  'tell',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'you',
  'your',
]);

function toFtsQuery(text: string): string {
  const tokens = text
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((token) => token !== '' && !STOP_WORDS.has(token.toLowerCase()))
    .filter((token) => /[\p{L}\p{N}]/u.test(token));

  return [...new Set(tokens)].map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ');
}
