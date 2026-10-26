import { STATE_TEXT } from '../../accounts/state-text.js';
import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/** The usage command. It shows the requests and tokens of each account in the window. */
export const usageCommand: SlashCommand = {
  name: 'usage',
  usage: '/usage',
  summary: 'Show the requests and tokens of each account in the rolling window.',
  run: async (_args, context) => {
    const summaries = context.services.usage.summaries();

    if (summaries.length === 0) {
      writeLine(context, 'No accounts. Run /login <provider> to add one.');
      return 'continue';
    }

    for (const { account, totals, state } of summaries) {
      // The cooling-until time is shown the same way as in `gauntlet usage`.
      const cooling =
        state !== 'cooling_down' || account.coolingUntil === undefined
          ? ''
          : ` until ${account.coolingUntil.toISOString()}`;
      writeLine(
        context,
        `${account.provider} ${account.label} [${STATE_TEXT[state]}${cooling}]: ` +
          `${String(totals.requests)} requests, ${String(totals.tokens)} tokens ` +
          `in the last ${String(context.services.windowHours)} hours`,
      );
    }
    return 'continue';
  },
};
