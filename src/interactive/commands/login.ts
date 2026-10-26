import { runLoginFlow } from '../../accounts/login-flow.js';
import { SqliteRiskNoticeStore, showRiskNotice } from '../../cli/risk-notice.js';
import { AppError } from '../../core/errors.js';

import { writeLine } from './write.js';
import type { SlashCommand } from './types.js';

/** The login command. It opens the visible browser and saves the session state. */
export const loginCommand: SlashCommand = {
  name: 'login',
  usage: '/login <provider> [label]',
  summary: 'Sign in to an account in the visible browser window.',
  run: async (args, context) => {
    const [provider, label] = args;
    if (provider === undefined) {
      throw new AppError('USAGE', 'Give the provider name.', {
        hint: 'Example: /login claude',
      });
    }

    const { services } = context;
    const write = (text: string): void => writeLine(context, text);

    const accepted = await showRiskNotice({
      store: new SqliteRiskNoticeStore(services.database),
      io: { write, ask: context.ask },
    });
    if (!accepted) {
      return 'continue';
    }

    const result = await runLoginFlow({
      adapter: services.registry.get(provider),
      launcher: services.launcher,
      accounts: services.accounts,
      vault: services.vault,
      output: { write },
      ...(label === undefined ? {} : { label }),
    });

    if (result.kind === 'signedIn') {
      writeLine(context, `Saved the account: ${result.account.provider} ${result.account.label}`);
    }
    return 'continue';
  },
};
