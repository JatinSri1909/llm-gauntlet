import { AppError } from '../../core/errors.js';

import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/** How many saved conversations `/resume` lists. */
const LIST_LIMIT = 10;
/** How many messages `/resume` shows after it loads a conversation. */
const SHOWN_MESSAGES = 4;
/** The longest message text that `/resume` shows. */
const SHOWN_CHARS = 200;

/** The new command. It starts a new conversation for the next request. */
export const newCommand: SlashCommand = {
  name: 'new',
  usage: '/new',
  summary: 'Start a new conversation.',
  run: async (_args, context) => {
    context.session.conversationId = undefined;
    writeLine(context, 'Started a new conversation.');
    return 'continue';
  },
};

/** The resume command. It lists the saved conversations, or loads one by its id. */
export const resumeCommand: SlashCommand = {
  name: 'resume',
  usage: '/resume [id]',
  summary: 'List the saved conversations, or load one by its id.',
  run: async (args, context) => {
    const store = context.services.store;
    const [idText] = args;

    if (idText === undefined) {
      const conversations = store.listConversations().slice(0, LIST_LIMIT);
      if (conversations.length === 0) {
        writeLine(context, 'No saved conversations.');
        return 'continue';
      }

      for (const conversation of conversations) {
        const title = conversation.title ?? '(no title)';
        writeLine(context, `#${String(conversation.id)}  ${conversation.createdAt}  ${title}`);
      }
      return 'continue';
    }

    const id = Number(idText);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('USAGE', 'The conversation id must be a whole number.', {
        hint: 'Run /resume to list the conversations and their ids.',
      });
    }

    if (store.getConversation(id) === undefined) {
      throw new AppError('CONVERSATION_MISSING', `The conversation does not exist: ${idText}`, {
        hint: 'Run /resume to list the conversations and their ids.',
      });
    }

    context.session.conversationId = id;
    writeLine(context, `Resumed conversation #${String(id)}.`);
    for (const message of store.lastMessages(id, SHOWN_MESSAGES)) {
      const text =
        message.content.length > SHOWN_CHARS
          ? `${message.content.slice(0, SHOWN_CHARS)}...`
          : message.content;
      writeLine(context, `${message.role}: ${text}`);
    }
    return 'continue';
  },
};
