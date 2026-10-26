import type { SlashCommand } from './types.js';

/** The exit command. It leaves the prompt. */
export const exitCommand: SlashCommand = {
  name: 'exit',
  usage: '/exit',
  summary: 'Leave the prompt.',
  run: async () => 'exit',
};
