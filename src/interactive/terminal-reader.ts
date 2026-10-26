import { createInterface, type Interface } from 'node:readline/promises';

import type { LineInput, LineReader } from './shell.js';

/** A reader for the real terminal. It turns Ctrl+C and Ctrl+D into inputs. */
export interface TerminalReader extends LineReader {
  /** Release the terminal. */
  close(): void;
}

/** Make the reader for the terminal input and output. */
export function createTerminalReader(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): TerminalReader {
  const terminal: Interface = createInterface({ input, output });

  return {
    read: (prompt) => readOne(terminal, prompt),
    close: () => terminal.close(),
  };
}

/** Ask one question. Ctrl+C, Ctrl+D, and a closed input end the question. */
function readOne(terminal: Interface, prompt: string): Promise<LineInput> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: LineInput): void => {
      if (!settled) {
        settled = true;
        terminal.off('SIGINT', onInterrupt);
        terminal.off('close', onClose);
        resolve(result);
      }
    };
    const onInterrupt = (): void => finish({ kind: 'interrupt' });
    const onClose = (): void => finish({ kind: 'eof' });

    terminal.once('SIGINT', onInterrupt);
    terminal.once('close', onClose);
    terminal.question(prompt).then(
      (text) => finish({ kind: 'line', text }),
      () => finish({ kind: 'eof' }),
    );
  });
}
