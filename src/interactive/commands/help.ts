import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/** The help command. It lists every slash command. */
export const helpCommand: SlashCommand = {
  name: 'help',
  usage: '/help',
  summary: 'List the slash commands.',
  run: async (_args, context) => {
    for (const command of context.commands) {
      writeLine(context, `${command.usage.padEnd(28)} ${command.summary}`);
    }
    return 'continue';
  },
};
