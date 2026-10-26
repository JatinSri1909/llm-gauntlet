import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { readSecret, type SecretInput } from '../src/cli/secret-input.js';

/** A fake terminal input. It records the raw mode and lets the test type. */
class FakeTerminal extends PassThrough {
  isTTY = true;
  rawMode: boolean[] = [];

  setRawMode(mode: boolean): this {
    this.rawMode.push(mode);
    return this;
  }
}

function typeLater(terminal: PassThrough, text: string): void {
  setImmediate(() => terminal.write(text));
}

describe('readSecret', () => {
  it('reads all of a pipe and trims it', async () => {
    const pipe = new PassThrough();
    typeLater(pipe, '  gsk_piped_key \n');
    setImmediate(() => pipe.end());

    expect(await readSecret('prompt: ', pipe as unknown as SecretInput, { write: () => 0 })).toBe(
      'gsk_piped_key',
    );
  });

  it('reads a terminal in raw mode, shows the prompt, and never echoes the key', async () => {
    const terminal = new FakeTerminal();
    const shown: string[] = [];
    const pending = readSecret('Key: ', terminal as unknown as SecretInput, {
      write: (text) => shown.push(text),
    });

    typeLater(terminal, 'abcx\u007fd\r');

    expect(await pending).toBe('abcd');
    expect(terminal.rawMode).toEqual([true, false]);
    expect(shown.join('')).toBe('Key: \n');
  });

  it('cancels on Ctrl+C and restores the terminal', async () => {
    const terminal = new FakeTerminal();
    const pending = readSecret('Key: ', terminal as unknown as SecretInput, { write: () => 0 });

    typeLater(terminal, 'ab\u0003');

    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(terminal.rawMode).toEqual([true, false]);
  });
});
