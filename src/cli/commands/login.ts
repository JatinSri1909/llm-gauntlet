import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the login command stub. */
export function createLoginCommand(): Command {
  return createPlannedCommand('login', 'Sign in to an account.', {
    name: '<provider>',
    description: 'provider name',
  });
}
