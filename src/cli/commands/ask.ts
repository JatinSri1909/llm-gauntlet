import { Command } from 'commander';

import { runRequest, sharedRequestOptions } from '../../app/run-request.js';
import { createBrowserLauncher } from '../../browser/launcher.js';
import type { BrowserLauncher } from '../../browser/types.js';
import { loadConfig, type Config } from '../../core/config.js';
import { createPlatform } from '../../platform/index.js';

import { withServices } from './services.js';

/** The parts that a test can replace. */
export interface AskCommandDeps {
  /** The browser launcher. The default starts Edge or Chromium. */
  readonly launcher?: BrowserLauncher;
  /** Return the config values. The default reads the config file. */
  readonly config?: () => Promise<Config>;
}

/** Make the ask command. It sends one request and prints the answer. */
export function createAskCommand(deps: AskCommandDeps = {}): Command {
  return new Command('ask')
    .description('Send one request and print the answer.')
    .argument('<text>', 'request text')
    .action(async (text: string) => {
      await withServices(async (services) => {
        const config = await (deps.config ?? readConfig)();
        const result = await runRequest({
          ...sharedRequestOptions(services, config, deps.launcher ?? createBrowserLauncher()),
          text,
        });

        for (const skipped of result.skipped) {
          console.error(`Skipped ${skipped.provider} ${skipped.label}: ${skipped.reason}.`);
        }

        if (result.warning !== undefined) {
          console.error(`Warning: the answer may be incomplete (${result.warning}).`);
        }

        console.log(result.text);
      });
    });
}

/** Read the config file of this machine. */
async function readConfig(): Promise<Config> {
  return loadConfig(createPlatform().dataPaths.configFile);
}
