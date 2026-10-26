import type { Account, AccountManager } from './account-manager.js';
import type { SessionVault } from '../security/session-vault.js';

/** The parts that the logout needs. */
export interface LogoutOptions {
  readonly accounts: AccountManager;
  readonly vault: SessionVault;
}

/**
 * Delete the saved session state of one account. Without a label, the first account of the
 * provider is used. It returns the removed account, or undefined when none matches.
 */
export async function logoutAccount(
  options: LogoutOptions,
  provider: string,
  label: string | undefined,
): Promise<Account | undefined> {
  const matches = options.accounts.list().filter((account) => account.provider === provider);
  const account =
    label === undefined ? matches[0] : matches.find((candidate) => candidate.label === label);

  if (account === undefined) {
    return undefined;
  }

  await options.vault.delete(account.id);
  options.accounts.remove(account.id);
  return account;
}
