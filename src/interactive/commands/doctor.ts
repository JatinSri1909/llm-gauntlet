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
      // formatCheck starts with the four-letter label, PASS or FAIL, so that label takes the color.
      const text = formatCheck(result);
      const color = result.status === 'pass' ? 'green' : 'red';
      writeLine(context, `  ${context.style.paint(text.slice(0, 4), color)}${text.slice(4)}`);
    }
    return 'continue';
  },
};
