import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the config command stub. */
export function createConfigCommand(): Command {
  return createPlannedCommand('config', 'Show or change the settings.');
}
