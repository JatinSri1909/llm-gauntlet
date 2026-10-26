import { accountsCommand } from './accounts.js';
import { configCommand } from './config.js';
import { doctorCommand } from './doctor.js';
import { exitCommand } from './exit.js';
import { helpCommand } from './help.js';
import { loginCommand } from './login.js';
import { logoutCommand } from './logout.js';
import { newCommand, resumeCommand } from './session.js';
import type { SlashCommand } from './types.js';
import { usageCommand } from './usage.js';
import { verboseCommand } from './verbose.js';

export type {
  SlashCommand,
  SlashContext,
  SlashOutcome,
  SlashServices,
  ShellSession,
} from './types.js';

/** Every slash command of the interactive prompt. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  helpCommand,
  accountsCommand,
  loginCommand,
  logoutCommand,
  configCommand,
  doctorCommand,
  usageCommand,
  newCommand,
  resumeCommand,
  verboseCommand,
  exitCommand,
];
