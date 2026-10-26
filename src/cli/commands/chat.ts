import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the chat command stub. */
export function createChatCommand(): Command {
  return createPlannedCommand('chat', 'Start interactive mode.');
}
