import { Command } from 'commander';

import { getSetting, listSettings, setSetting, type SettingsOptions } from '../../app/settings.js';
import { AppError } from '../../core/errors.js';
import { createPlatform } from '../../platform/index.js';

/** The parts that a test can replace. */
export interface ConfigCommandDeps {
  /** Return the config file path. The default is the path of this machine. */
  readonly configFile?: () => string;
}

/** Make the config command. It shows the settings, or gets and sets one of them. */
export function createConfigCommand(deps: ConfigCommandDeps = {}): Command {
  const options = (): SettingsOptions => ({
    configFile: deps.configFile?.() ?? createPlatform().dataPaths.configFile,
  });

  const command = new Command('config')
    .description('Show or change the settings.')
    .action(async () => {
      await report(async () => console.log(await listSettings(options())));
    });

  command
    .command('get')
    .description('Show the value of one setting.')
    .argument('<key>', 'setting name. Example: context.maxTokens')
    .action(async (key: string) => {
      await report(async () => console.log(await getSetting(options(), key)));
    });

  command
    .command('set')
    .description('Change the value of one setting.')
    .argument('<key>', 'setting name. Example: localOnly')
    .argument('<value>', 'new value. Use JSON for numbers and true or false.')
    .action(async (key: string, value: string) => {
      await report(async () => console.log(await setSetting(options(), key, value)));
    });

  return command;
}

/** Run one action. A typed error prints its message and hint, and sets the exit code to 1. */
async function report(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    console.error(error.message);
    if (error.hint !== undefined) {
      console.error(error.hint);
    }
    process.exitCode = 1;
  }
}
