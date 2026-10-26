import type { Command } from 'commander';

import { createAccountsCommand } from './accounts.js';
import { createAskCommand } from './ask.js';
import { createChatCommand } from './chat.js';
import { createConfigCommand } from './config.js';
import { createDoctorCommand } from './doctor.js';
import { createKeyCommand } from './key.js';
import { createLoginCommand } from './login.js';
import { createLogoutCommand } from './logout.js';
import { createUsageCommand } from './usage.js';

/** Add each command to the program. */
export function registerCommands(program: Command): void {
  program.addCommand(createLoginCommand());
  program.addCommand(createLogoutCommand());
  program.addCommand(createAccountsCommand());
  program.addCommand(createAskCommand());
  program.addCommand(createChatCommand());
  program.addCommand(createUsageCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createKeyCommand());
}
