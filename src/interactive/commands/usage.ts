import { STATE_TEXT } from '../../accounts/state-text.js';
import { writeLine, writeTable } from './write.js';
import type { SlashCommand } from './types.js';

/** The usage command. It shows the requests and tokens of each account in the window. */
export const usageCommand: SlashCommand = {
  name: 'usage',
  usage: '/usage',
  summary: 'Show the requests and tokens of each account in the rolling window.',
  run: async (_args, context) => {
    const summaries = context.services.usage.summaries();

    if (summaries.length === 0) {
      writeLine(context, '  No accounts yet. Run /login <provider> to add one.');
      return 'continue';
    }

    const hours = String(context.services.windowHours);
    writeLine(context);
    writeLine(context, context.style.paint(`  Last ${hours} hours`, 'dim'));
    writeTable(
      context,
      [
        ['ACCOUNT', 'STATE', 'REQUESTS', 'TOKENS'],
        ...summaries.map(({ account, totals, state }) => [
          `${account.provider} ${account.label}`,
          // The cooling-until time is shown the same way as in `gauntlet usage`.
          state !== 'cooling_down' || account.coolingUntil === undefined
            ? STATE_TEXT[state]
            : `${STATE_TEXT[state]} until ${account.coolingUntil.toISOString()}`,
          String(totals.requests),
          String(totals.tokens),
        ]),
      ],
      true,
    );
    return 'continue';
  },
};
