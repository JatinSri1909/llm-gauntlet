import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/** The verbose command. It turns the routing detail in the status line on and off. */
export const verboseCommand: SlashCommand = {
  name: 'verbose',
  usage: '/verbose',
  summary: 'Turn the routing detail in the status line on or off.',
  run: async (_args, context) => {
    context.session.verbose = !context.session.verbose;
    writeLine(context, `Verbose detail is ${context.session.verbose ? 'on' : 'off'}.`);
    return 'continue';
  },
};
