import { Command } from 'commander';

import { withServices } from './services.js';

/** Make the logout command. */
export function createLogoutCommand(): Command {
  const command = new Command('logout')
    .description('Delete the saved session state of one account.')
    .argument('<provider>', 'provider name')
    .argument('[label]', 'account label. It is needed when a provider has more than one account.')
    .action(async (provider: string, label: string | undefined) => {
      await withServices(async (services) => {
        const accounts = services.accounts
          .list()
          .filter((account) => account.provider === provider);

        const account =
          label === undefined
            ? accounts[0]
            : accounts.find((candidate) => candidate.label === label);

        if (account === undefined) {
          console.log(`No account for the provider: ${provider}`);
          return;
        }

        await services.vault.delete(account.id);
        services.accounts.remove(account.id);
        console.log(`Removed the account: ${account.provider} ${account.label}`);
      });
    });

  return command;
}
