import { createInterface, type Interface } from 'node:readline/promises';

import type { LineInput, LineReader } from './shell.js';

const NEWLINE = String.fromCharCode(10);
const WAIT_NOTICE = `Waiting for the current request to finish. Press Ctrl+C again to quit now.${NEWLINE}`;

/** A reader for the real terminal. It turns Ctrl+C and Ctrl+D into inputs. */
export interface TerminalReader extends LineReader {
  /** Release the terminal. */
  close(): void;
}

/**
 * Make the reader for the terminal input and output. Lines that arrive while the shell is busy
 * wait in a queue, so typing ahead does not lose text.
 */
export function createTerminalReader(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): TerminalReader {
  const terminal: Interface = createInterface({ input, output });
  const queue: LineInput[] = [];
  let waiting: ((result: LineInput) => void) | undefined;
  let isClosed = false;
  let isInterruptRequested = false;

  const deliver = (result: LineInput): void => {
    if (waiting === undefined) {
      queue.push(result);
      return;
    }

    const resolve = waiting;
    waiting = undefined;
    resolve(result);
  };

  terminal.on('line', (text) => deliver({ kind: 'line', text }));
  terminal.on('SIGINT', () => {
    if (waiting !== undefined) {
      deliver({ kind: 'interrupt' });
      return;
    }

    // A request is running. It cannot be stopped mid-way, so the prompt closes after its answer.
    // A second Ctrl+C quits at once.
    if (isInterruptRequested) {
      output.write(NEWLINE);
      terminal.close();
      process.exit(130);
    }

    isInterruptRequested = true;
    output.write(WAIT_NOTICE);
  });
  terminal.on('close', () => {
    isClosed = true;
    deliver({ kind: 'eof' });
  });

  return {
    read: (prompt) => {
      if (isInterruptRequested) {
        isInterruptRequested = false;
        return Promise.resolve({ kind: 'interrupt' });
      }

      const queued = queue.shift();
      if (queued !== undefined) {
        return Promise.resolve(queued);
      }

      if (isClosed) {
        return Promise.resolve({ kind: 'eof' });
      }

      terminal.setPrompt(prompt);
      terminal.prompt();
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    close: () => terminal.close(),
  };
}
