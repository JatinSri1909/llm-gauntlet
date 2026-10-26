import type { AccountManager } from '../../accounts/account-manager.js';
import type { BrowserLauncher } from '../../browser/types.js';
import type { ContextStore } from '../../context/context-store.js';
import type { AdapterRegistry } from '../../providers/registry.js';
import type { SessionVault } from '../../security/session-vault.js';
import type { SqliteDatabase } from '../../store/database.js';
import type { UsageTracker } from '../../usage/usage-tracker.js';
import type { Style, TerminalOutput } from '../render.js';

/** The services that the slash commands use. */
export interface SlashServices {
  readonly database: SqliteDatabase;
  readonly accounts: AccountManager;
  readonly vault: SessionVault;
  readonly registry: AdapterRegistry;
  readonly store: ContextStore;
  readonly usage: UsageTracker;
  /** The length of the usage window in hours. */
  readonly windowHours: number;
  /** The config file of this machine. */
  readonly configFile: string;
  readonly launcher: BrowserLauncher;
}

/** The state of one interactive run. */
export interface ShellSession {
  /** The conversation of the run. It is missing before the first answer and after `/new`. */
  conversationId: number | undefined;
  /** True when the status line shows the routing detail. */
  verbose: boolean;
}

/** What a slash command gets when it runs. */
export interface SlashContext {
  readonly services: SlashServices;
  readonly session: ShellSession;
  readonly output: TerminalOutput;
  readonly style: Style;
  /** Every slash command. The help command lists them. */
  readonly commands: readonly SlashCommand[];
  /** Ask the user one question and return the answer. */
  ask(question: string): Promise<string>;
}

/** The result of a slash command. `exit` ends the prompt. */
export type SlashOutcome = 'continue' | 'exit';

/** One slash command, such as `/login`. */
export interface SlashCommand {
  /** The name without the slash. */
  readonly name: string;
  /** The usage text. Example: `/login <provider> [label]`. */
  readonly usage: string;
  /** One short line for the help command. */
  readonly summary: string;
  /** Run the command. The arguments are the words after the name. */
  run(args: readonly string[], context: SlashContext): Promise<SlashOutcome>;
}
