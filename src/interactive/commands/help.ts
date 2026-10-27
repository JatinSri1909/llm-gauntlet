import { writeLine, writeTable } from './write.js';
import type { SlashCommand } from './types.js';

/** The help command. It lists every slash command. */
export const helpCommand: SlashCommand = {
  name: 'help',
  usage: '/help',
  summary: 'List the slash commands.',
  run: async (_args, context) => {
    writeLine(context);
    writeTable(
      context,
      context.commands.map((command) => [command.usage, command.summary]),
    );
    writeLine(context);
    return 'continue';
  },
};
