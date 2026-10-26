import type { SlashContext } from './types.js';

/** Write one line of text to the output. */
export function writeLine(context: SlashContext, text = ''): void {
  context.output.write(`${text}\n`);
}
