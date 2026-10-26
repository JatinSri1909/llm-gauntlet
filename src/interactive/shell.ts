import type { RunRequestResult } from '../app/run-request.js';
import { AppError } from '../core/errors.js';

import type { SlashCommand, SlashContext, ShellSession, SlashServices } from './commands/types.js';
import { createStyle, startSpinner, type Style, type TerminalOutput } from './render.js';
import { formatStatusLine } from './status-line.js';

/** The prompt that the shell shows before each input. */
export const PROMPT = 'gauntlet> ';

/** One input from the reader. `eof` is Ctrl+D and `interrupt` is Ctrl+C. */
export type LineInput =
  | { readonly kind: 'line'; readonly text: string }
  | { readonly kind: 'eof' }
  | { readonly kind: 'interrupt' };

/** Read one line of input after the prompt. */
export interface LineReader {
  read(prompt: string): Promise<LineInput>;
}

/** The parts of the shell. The tests replace the reader and the request. */
export interface ShellOptions {
  readonly reader: LineReader;
  readonly output: TerminalOutput;
  readonly env: NodeJS.ProcessEnv;
  /** Send one request. The shell passes the conversation of the earlier turns. */
  readonly send: (text: string, conversationId: number | undefined) => Promise<RunRequestResult>;
  /** The slash commands. A line that starts with `/` runs one of them. */
  readonly commands: readonly SlashCommand[];
  /** The services that the slash commands use. */
  readonly services: SlashServices;
}

/**
 * Run the interactive prompt until the user leaves it. Each input is one request in the same
 * conversation, unless it starts with `/`. A slash command runs its own action. A typed error
 * prints its message and returns to the prompt. Ctrl+C and Ctrl+D leave the prompt.
 */
export async function runShell(options: ShellOptions): Promise<void> {
  const { output, env } = options;
  const style = createStyle(output, env);
  const session: ShellSession = { conversationId: undefined, verbose: false };
  const context: SlashContext = {
    services: options.services,
    session,
    output,
    style,
    commands: options.commands,
    ask: async (question) => {
      const input = await options.reader.read(question);
      return input.kind === 'line' ? input.text : '';
    },
  };

  for (;;) {
    const input = await options.reader.read(PROMPT);
    if (input.kind !== 'line') {
      output.write('\n');
      return;
    }

    const text = input.text.trim();
    if (text === '') {
      continue;
    }

    if (text.startsWith('/')) {
      const outcome = await runSlash(text, context);
      if (outcome === 'exit') {
        return;
      }
      continue;
    }

    const result = await answer(options, text, session.conversationId, style);
    if (result === undefined) {
      continue;
    }

    session.conversationId = result.conversationId;
    printResult(output, style, session, result);
  }
}

/** Run one slash command. An unknown command or a typed error prints a message. */
async function runSlash(text: string, context: SlashContext): Promise<'continue' | 'exit'> {
  const [name = '', ...args] = text.slice(1).split(/\s+/);
  const command = context.commands.find((candidate) => candidate.name === name);

  if (command === undefined) {
    reportError(
      context.output,
      context.style,
      new AppError('UNKNOWN_COMMAND', `Unknown command: /${name}.`, {
        hint: 'Type /help to list the commands.',
      }),
    );
    return 'continue';
  }

  try {
    return await command.run(args, context);
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    reportError(context.output, context.style, error);
    return 'continue';
  }
}

/** Send one input and show a spinner. It returns undefined after it prints a typed error. */
async function answer(
  options: ShellOptions,
  text: string,
  conversationId: number | undefined,
  style: Style,
): Promise<RunRequestResult | undefined> {
  const spinner = startSpinner(options.output, options.env, 'Thinking');

  try {
    return await options.send(text, conversationId);
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    reportError(options.output, style, error);
    return undefined;
  } finally {
    spinner.stop();
  }
}

/** Print a typed error with its hint. */
function reportError(output: TerminalOutput, style: Style, error: AppError): void {
  output.write(`${style.paint(error.message, 'red')}\n`);
  if (error.hint !== undefined) {
    output.write(`${style.paint(error.hint, 'dim')}\n`);
  }
}

/** Print the skipped accounts, the answer, the warning, and the status line. */
function printResult(
  output: TerminalOutput,
  style: Style,
  session: ShellSession,
  result: RunRequestResult,
): void {
  for (const skipped of result.skipped) {
    output.write(
      `${style.paint(`Skipped ${skipped.provider} ${skipped.label}: ${skipped.reason}.`, 'dim')}\n`,
    );
  }

  output.write(`${result.text}\n`);

  if (result.warning !== undefined) {
    output.write(
      `${style.paint(`Warning: the answer may be incomplete (${result.warning}).`, 'red')}\n`,
    );
  }

  output.write(`${style.paint(formatStatusLine(result, session.verbose), 'dim')}\n`);
}
