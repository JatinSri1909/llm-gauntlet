import { Command } from 'commander';

import { logoutAccount } from '../../accounts/logout.js';

import { withServices } from './services.js';

/** Make the logout command. */
export function createLogoutCommand(): Command {
  const command = new Command('logout')
    .description('Delete the saved session state of one account.')
    .argument('<provider>', 'provider name')
    .argument('[label]', 'account label. It is needed when a provider has more than one account.')
    .action(async (provider: string, label: string | undefined) => {
      await withServices(async (services) => {
        const removed = await logoutAccount(services, provider, label);

        if (removed === undefined) {
          console.log(`No account for the provider: ${provider}`);
          return;
        }

        console.log(`Removed the account: ${removed.provider} ${removed.label}`);
      });
    });

  return command;
}
