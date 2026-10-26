import { logoutAccount } from '../../accounts/logout.js';
import { AppError } from '../../core/errors.js';

import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/** The logout command. It deletes the saved session state of one account. */
export const logoutCommand: SlashCommand = {
  name: 'logout',
  usage: '/logout <provider> [label]',
  summary: 'Delete the saved session state of one account.',
  run: async (args, context) => {
    const [provider, label] = args;
    if (provider === undefined) {
      throw new AppError('USAGE', 'Give the provider name.', {
        hint: 'Example: /logout claude',
      });
    }

    const removed = await logoutAccount(
      { accounts: context.services.accounts, vault: context.services.vault },
      provider,
      label,
    );

    writeLine(
      context,
      removed === undefined
        ? `No account for the provider: ${provider}`
        : `Removed the account: ${removed.provider} ${removed.label}`,
    );
    return 'continue';
  },
};
