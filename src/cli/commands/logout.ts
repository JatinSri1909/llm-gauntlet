import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the logout command stub. */
export function createLogoutCommand(): Command {
  return createPlannedCommand('logout', 'Delete the saved session of one account.', {
    name: '<provider>',
    description: 'provider name',
  });
}
