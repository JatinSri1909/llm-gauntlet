import { AppError } from '../core/errors.js';

/** The parts of the standard input that the secret reader needs. Tests replace them. */
export interface SecretInput {
  readonly isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  off(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
  off(event: 'end', listener: () => void): unknown;
}

/** Where the prompt text goes. */
export interface SecretOutput {
  write(text: string): unknown;
}

const CTRL_C = '\u0003';
const BACKSPACE = '\u007f';

/**
 * Read one secret. On a terminal it shows the prompt and hides what the user types. When the
 * input is a pipe, it reads all of it. The secret never goes through a command line argument.
 */
export function readSecret(
  prompt: string,
  input: SecretInput = process.stdin,
  output: SecretOutput = process.stdout,
): Promise<string> {
  input.setEncoding('utf8');

  return input.isTTY === true && input.setRawMode !== undefined
    ? readHidden(prompt, input, output)
    : readAll(input);
}

function readAll(input: SecretInput): Promise<string> {
  return new Promise((resolve) => {
    let text = '';

    const onData = (chunk: string | Buffer): void => {
      text += chunk.toString();
    };
    const onEnd = (): void => {
      input.off('data', onData);
      input.off('end', onEnd);
      resolve(text.trim());
    };

    input.on('data', onData);
    input.on('end', onEnd);
    input.resume();
  });
}

function readHidden(prompt: string, input: SecretInput, output: SecretOutput): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';

    const finish = (): void => {
      input.off('data', onData);
      input.setRawMode?.(false);
      input.pause();
      output.write('\n');
    };

    const onData = (chunk: string | Buffer): void => {
      for (const character of chunk.toString()) {
        if (character === '\r' || character === '\n') {
          finish();
          resolve(value.trim());
          return;
        }

        if (character === CTRL_C) {
          finish();
          reject(new AppError('CANCELLED', 'The input was cancelled.'));
          return;
        }

        value =
          character === BACKSPACE || character === '\b' ? value.slice(0, -1) : value + character;
      }
    };

    output.write(prompt);
    input.setRawMode?.(true);
    input.on('data', onData);
    input.resume();
  });
}
