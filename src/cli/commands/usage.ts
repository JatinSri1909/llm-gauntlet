import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the usage command stub. */
export function createUsageCommand(): Command {
  return createPlannedCommand('usage', 'Show the local usage records.');
}
