import { describe, expect, it } from 'vitest';

import { writeNotice, type TerminalOutput } from '../src/interactive/render.js';

function outputOf(isTerminal: boolean): { output: TerminalOutput; written: string[] } {
  const written: string[] = [];
  return { output: { isTerminal, write: (text) => written.push(text) }, written };
}

describe('writeNotice', () => {
  it('clears the spinner line on a terminal, then writes the text and a new line', () => {
    const { output, written } = outputOf(true);

    writeNotice(output, 'Waiting.');

    const text = written.join('');
    expect(text.startsWith('\r')).toBe(true);
    expect(text.endsWith('\rWaiting.\n')).toBe(true);
  });

  it('writes only the text and a new line when the output is not a terminal', () => {
    const { output, written } = outputOf(false);

    writeNotice(output, 'Waiting.');

    expect(written.join('')).toBe('Waiting.\n');
  });
});
