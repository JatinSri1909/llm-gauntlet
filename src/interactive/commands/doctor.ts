import { formatCheck, runChecks } from '../../doctor/checks.js';

import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/** The doctor command. It runs the same checks as `gauntlet doctor`. */
export const doctorCommand: SlashCommand = {
  name: 'doctor',
  usage: '/doctor',
  summary: 'Check Node.js, the browser, the data folder, the key store, and the database.',
  run: async (_args, context) => {
    for (const result of await runChecks(context.services.environment)) {
      writeLine(context, formatCheck(result));
    }
    return 'continue';
  },
};
