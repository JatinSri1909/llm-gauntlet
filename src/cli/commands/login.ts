import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';

import { runLoginFlow } from '../../accounts/login-flow.js';
import { createBrowserLauncher } from '../../browser/launcher.js';
import type { BrowserLauncher } from '../../browser/types.js';
import { showRiskNotice, SqliteRiskNoticeStore } from '../risk-notice.js';

import { withServices } from './services.js';

/** The input and output of the login command. */
export interface LoginCommandIo {
  /** Show one line of text to the user. */
  write(text: string): void;
  /** Ask the user one question and return the answer. */
  ask(question: string): Promise<string>;
  /** Release the input. */
  close(): void;
}

/** The parts that a test can replace. */
export interface LoginCommandDeps {
  /** The input and output. The default uses the terminal. */
  readonly io?: LoginCommandIo;
  /** The browser launcher. The default starts Edge or Chromium. */
  readonly launcher?: BrowserLauncher;
}

/** Make the login command. */
export function createLoginCommand(deps: LoginCommandDeps = {}): Command {
  return new Command('login')
    .description('Sign in to an account and save the encrypted session state.')
    .argument('<provider>', 'provider name')
    .argument('[label]', 'account label. The default is the provider name.')
    .action(async (provider: string, label: string | undefined) => {
      await withServices(async (services) => {
        const io = deps.io ?? createConsoleIo();

        try {
          const accepted = await showRiskNotice({
            store: new SqliteRiskNoticeStore(services.database),
            io: {
              write: (text) => io.write(text),
              ask: (question) => io.ask(question),
            },
          });

          if (!accepted) {
            return;
          }

          const result = await runLoginFlow({
            adapter: services.registry.get(provider),
            launcher: deps.launcher ?? createBrowserLauncher(),
            accounts: services.accounts,
            vault: services.vault,
            output: { write: (text) => io.write(text) },
            ...(label === undefined ? {} : { label }),
          });

          if (result.kind === 'signedIn') {
            io.write(`Saved the account: ${result.account.provider} ${result.account.label}`);
          }
        } finally {
          io.close();
        }
      });
    });
}

/** Make the terminal input and output. */
function createConsoleIo(): LoginCommandIo {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });

  return {
    write: (text) => console.log(text),
    ask: (question) => terminal.question(question),
    close: () => terminal.close(),
  };
}
