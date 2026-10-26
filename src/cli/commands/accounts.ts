import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the accounts command stub. */
export function createAccountsCommand(): Command {
  return createPlannedCommand('accounts', 'List the accounts and their status.');
}
