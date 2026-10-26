import type { AccountState } from '../../accounts/account-manager.js';
import { removeAccount } from '../../accounts/logout.js';

import { Command } from 'commander';

import { withServices } from './services.js';

const STATE_TEXT: Record<AccountState, string> = {
  needs_login: 'needs login',
  ready: 'ready',
  cooling_down: 'cooling down',
  blocked: 'blocked',
};

/** Make the accounts command. */
export function createAccountsCommand(): Command {
  const command = new Command('accounts')
    .description('List the accounts and their status.')
    .action(async () => {
      await withServices(async (services) => {
        const accounts = services.accounts.list();

        if (accounts.length === 0) {
          console.log('No accounts. Run "gauntlet login <provider>" to add one.');
          return;
        }

        for (const account of accounts) {
          const cooling =
            account.coolingUntil === undefined
              ? ''
              : ` until ${account.coolingUntil.toISOString()}`;
          console.log(
            `${account.provider} ${account.label} [${STATE_TEXT[account.state]}]${cooling}`,
          );
        }
      });
    });

  command
    .command('remove')
    .description('Remove an account, its saved session state, and its usage history.')
    .argument('<provider>', 'provider name')
    .argument('[label]', 'account label. It is needed when a provider has more than one account.')
    .action(async (provider: string, label: string | undefined) => {
      await withServices(async (services) => {
        const removed = await removeAccount(services, provider, label);

        if (removed === undefined) {
          console.log(`No account for the provider: ${provider}`);
          return;
        }

        console.log(`Removed the account: ${removed.provider} ${removed.label}`);
      });
    });

  return command;
}
