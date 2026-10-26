import { AppError } from '../core/errors.js';
import type { BrowserLauncher } from '../browser/types.js';
import type { ProviderAdapter, ProviderPage } from '../providers/types.js';
import type { SessionVault } from '../security/session-vault.js';

import type { Account, AccountManager } from './account-manager.js';

/** The text output that the login flow needs. */
export interface LoginOutput {
  /** Show one line of text to the user. */
  write(text: string): void;
}

/** The result of one login attempt. */
export type LoginResult =
  | { readonly kind: 'signedIn'; readonly account: Account }
  | { readonly kind: 'captchaRequired'; readonly message: string };

/** The inputs for the login flow. */
export interface LoginFlowOptions {
  /** The adapter of the provider. */
  readonly adapter: ProviderAdapter;
  /** The browser launcher. */
  readonly launcher: BrowserLauncher;
  /** The account manager. */
  readonly accounts: AccountManager;
  /** The encrypted session vault. */
  readonly vault: SessionVault;
  /** The text output. */
  readonly output: LoginOutput;
  /** The account label. The default is the provider name. */
  readonly label?: string;
  /** The time limit for the sign-in in milliseconds. */
  readonly timeoutMs?: number;
  /** The time between two sign-in checks in milliseconds. */
  readonly pollIntervalMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const CAPTCHA_PATTERN =
  /complete the captcha|solve the captcha|verify (that )?you are (a )?human|are you a robot|human check/i;
const CAPTCHA_MESSAGE =
  'A CAPTCHA stopped the login. Solve it in the visible browser window and run login again.';

/**
 * Open the visible browser, wait for the sign-in, and save the session state.
 * It stops when the page shows a CAPTCHA. It never solves one.
 */
export async function runLoginFlow(options: LoginFlowOptions): Promise<LoginResult> {
  const requestedLabel = options.label?.trim() ?? '';
  const label = requestedLabel === '' ? options.adapter.name : requestedLabel;
  const session = await options.launcher.launch({
    purpose: 'login',
    startUrl: options.adapter.loginUrl,
  });

  try {
    const captchaRequired = await waitForSignIn(options, session.page);
    if (captchaRequired) {
      options.output.write(CAPTCHA_MESSAGE);
      return { kind: 'captchaRequired', message: CAPTCHA_MESSAGE };
    }

    const state = await session.storageState();
    const account = findOrAddAccount(options.accounts, options.adapter.name, label);

    await options.vault.save(account.id, state);
    options.accounts.setState(account.id, 'ready');

    const ready = options.accounts.get(account.id);
    return { kind: 'signedIn', account: ready ?? account };
  } finally {
    await session.close();
  }
}

/** Wait for a signed-in page. It returns true when the page shows a CAPTCHA. */
async function waitForSignIn(options: LoginFlowOptions, page: ProviderPage): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const attempts = Math.max(1, Math.ceil(timeoutMs / pollIntervalMs));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await options.adapter.isSignedIn(page)) {
      return false;
    }

    if (await pageShowsCaptcha(page)) {
      return true;
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  throw new AppError('LOGIN_TIMEOUT', 'The login did not finish in time.', {
    hint: 'Run the login command again and finish the sign-in in the browser window.',
  });
}

/** Return true when the page text holds a CAPTCHA or a human check. */
async function pageShowsCaptcha(page: ProviderPage): Promise<boolean> {
  return CAPTCHA_PATTERN.test(await page.bodyText());
}

/** Find the account, or add it when it is new. */
function findOrAddAccount(accounts: AccountManager, provider: string, label: string): Account {
  const existing = accounts.find(provider, label);
  if (existing !== undefined) {
    return existing;
  }

  return accounts.add({ provider, label });
}
