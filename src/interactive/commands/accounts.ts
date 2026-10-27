import { writeLine, writeTable } from './write.js';
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
      writeLine(context, '  No accounts yet. Run /login <provider> to add one.');
      return 'continue';
    }

    writeTable(
      context,
      [
        ['PROVIDER', 'LABEL', 'STATE'],
        ...accounts.map((account) => [
          account.provider,
          account.label,
          account.coolingUntil === undefined
            ? STATE_TEXT[account.state]
            : `${STATE_TEXT[account.state]} until ${account.coolingUntil.toISOString()}`,
        ]),
      ],
      true,
    );
    return 'continue';
  },
};
