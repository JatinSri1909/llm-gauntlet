import type { RunRequestResult } from '../app/run-request.js';
import { AppError } from '../core/errors.js';

import { createStyle, startSpinner, type TerminalOutput } from './render.js';

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
}

/**
 * Run the interactive prompt until the user leaves it. Each input is one request in the same
 * conversation. A typed error prints its message and returns to the prompt. Ctrl+C and Ctrl+D
 * leave the prompt.
 */
export async function runShell(options: ShellOptions): Promise<void> {
  const { output, env } = options;
  const style = createStyle(output, env);
  let conversationId: number | undefined;

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

    const result = await answer(options, text, conversationId, style);
    if (result === undefined) {
      continue;
    }

    conversationId = result.conversationId;
    printResult(output, style, result);
  }
}

/** Send one input and show a spinner. It returns undefined after it prints a typed error. */
async function answer(
  options: ShellOptions,
  text: string,
  conversationId: number | undefined,
  style: ReturnType<typeof createStyle>,
): Promise<RunRequestResult | undefined> {
  const spinner = startSpinner(options.output, options.env, 'Thinking');

  try {
    return await options.send(text, conversationId);
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    options.output.write(`${style.paint(error.message, 'red')}\n`);
    if (error.hint !== undefined) {
      options.output.write(`${style.paint(error.hint, 'dim')}\n`);
    }
    return undefined;
  } finally {
    spinner.stop();
  }
}

/** Print the skipped accounts, the answer, and the warning. */
function printResult(
  output: TerminalOutput,
  style: ReturnType<typeof createStyle>,
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
}
