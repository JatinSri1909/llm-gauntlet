import type { AccountState } from './account-manager.js';

/** The words that show an account state. Every command uses these words. */
export const STATE_TEXT: Record<AccountState, string> = {
  needs_login: 'needs login',
  ready: 'ready',
  cooling_down: 'cooling down',
  blocked: 'blocked',
};
