import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the ask command stub. */
export function createAskCommand(): Command {
  return createPlannedCommand('ask', 'Send one request and print the answer.', {
    name: '<text>',
    description: 'request text',
  });
}
