import { AppError } from '../core/errors.js';
import type { SessionVault } from '../security/session-vault.js';

import type { Account, AccountManager } from './account-manager.js';

/** The parts that the logout needs. */
export interface LogoutOptions {
  readonly accounts: AccountManager;
  readonly vault: SessionVault;
}

/**
 * Delete the saved session state of one account and mark it as needing a login. The account
 * row stays, so its usage history stays too. Without a label, the provider must have one
 * account. It returns the account, or undefined when no account matches.
 */
export async function logoutAccount(
  options: LogoutOptions,
  provider: string,
  label: string | undefined,
): Promise<Account | undefined> {
  const account = findAccount(options.accounts, provider, label);
  if (account === undefined) {
    return undefined;
  }

  await options.vault.delete(account.id);
  options.accounts.setState(account.id, 'needs_login');
  return account;
}

/**
 * Remove one account for good. It deletes the saved session state, the account row, and the
 * usage history of the account. Without a label, the provider must have one account. It returns
 * the removed account, or undefined when no account matches.
 */
export async function removeAccount(
  options: LogoutOptions,
  provider: string,
  label: string | undefined,
): Promise<Account | undefined> {
  const account = findAccount(options.accounts, provider, label);
  if (account === undefined) {
    return undefined;
  }

  await options.vault.delete(account.id);
  options.accounts.remove(account.id);
  return account;
}

/** Find the account of a command. Two accounts and no label is an error, not a guess. */
function findAccount(
  accounts: AccountManager,
  provider: string,
  label: string | undefined,
): Account | undefined {
  const name = provider.trim().toLowerCase();
  const matches = accounts.list().filter((account) => account.provider === name);

  if (label === undefined && matches.length > 1) {
    throw new AppError(
      'ACCOUNT_AMBIGUOUS',
      `The provider ${name} has ${String(matches.length)} accounts.`,
      {
        hint: `Give the label of the account. Labels: ${matches.map((account) => account.label).join(', ')}.`,
      },
    );
  }

  return label === undefined
    ? matches[0]
    : matches.find((candidate) => candidate.label === label.trim());
}
