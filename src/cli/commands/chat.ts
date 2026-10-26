import { Command } from 'commander';

import { runRequest, sharedRequestOptions } from '../../app/run-request.js';
import { createBrowserLauncher } from '../../browser/launcher.js';
import type { BrowserLauncher } from '../../browser/types.js';
import { loadConfig, type Config } from '../../core/config.js';
import { createPlatform } from '../../platform/index.js';
import { createTerminalReader } from '../../interactive/terminal-reader.js';
import { runShell, type LineReader } from '../../interactive/shell.js';
import type { TerminalOutput } from '../../interactive/render.js';

import { withServices } from './services.js';

/** The parts that a test can replace. */
export interface ChatCommandDeps {
  /** The browser launcher. The default starts Edge or Chromium. */
  readonly launcher?: BrowserLauncher;
  /** Return the config values. The default reads the config file. */
  readonly config?: () => Promise<Config>;
  /** The line reader. The default reads the terminal. */
  readonly reader?: LineReader;
  /** The output. The default is the standard output. */
  readonly output?: TerminalOutput;
  /** The environment. The default is the process environment. */
  readonly env?: NodeJS.ProcessEnv;
}

/** Make the chat command. It starts the interactive prompt. */
export function createChatCommand(deps: ChatCommandDeps = {}): Command {
  return new Command('chat').description('Start interactive mode.').action(async () => {
    await runChat(deps);
  });
}

/**
 * Run the interactive prompt. It is used by `gauntlet chat` and by `gauntlet` with no arguments.
 * Each input goes through the same request runner as `ask`. The turns share one conversation.
 */
export async function runChat(deps: ChatCommandDeps = {}): Promise<void> {
  await withServices(async (services) => {
    const config = await (deps.config ?? readConfig)();
    const launcher = deps.launcher ?? createBrowserLauncher();
    const run = (reader: LineReader): Promise<void> =>
      runShell({
        reader,
        output: deps.output ?? createTerminalOutput(),
        env: deps.env ?? process.env,
        send: (text, conversationId) =>
          runRequest({
            ...sharedRequestOptions(services, config, launcher),
            text,
            ...(conversationId === undefined ? {} : { conversationId }),
          }),
      });

    if (deps.reader !== undefined) {
      await run(deps.reader);
      return;
    }

    const terminal = createTerminalReader();
    try {
      await run(terminal);
    } finally {
      terminal.close();
    }
  });
}

/** Read the config file of this machine. */
async function readConfig(): Promise<Config> {
  return loadConfig(createPlatform().dataPaths.configFile);
}

/** Make the output for the standard output of this process. */
function createTerminalOutput(): TerminalOutput {
  return {
    isTerminal: process.stdout.isTTY === true,
    write: (text) => {
      process.stdout.write(text);
    },
  };
}
