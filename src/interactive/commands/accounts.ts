import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';
import { STATE_TEXT } from '../../accounts/state-text.js';

/** The accounts command. It lists the accounts and their states. */
export const accountsCommand: SlashCommand = {
  name: 'accounts',
  usage: '/accounts',
  summary: 'List the accounts and their states.',
  run: async (_args, context) => {
    const accounts = context.services.accounts.list();

    if (accounts.length === 0) {
      writeLine(context, 'No accounts. Run /login <provider> to add one.');
      return 'continue';
    }

    for (const account of accounts) {
      const cooling =
        account.coolingUntil === undefined ? '' : ` until ${account.coolingUntil.toISOString()}`;
      writeLine(
        context,
        `${account.provider} ${account.label} [${STATE_TEXT[account.state]}]${cooling}`,
      );
    }
    return 'continue';
  },
};
