import { formatTable } from '../render.js';

import type { SlashContext } from './types.js';

/** Write one line of text to the output. */
export function writeLine(context: SlashContext, text = ''): void {
  context.output.write(`${text}\n`);
}

/**
 * Write rows in aligned columns, indented by two spaces. When `header` is true, the first row is a
 * header and it is dimmed.
 */
export function writeTable(
  context: SlashContext,
  rows: readonly (readonly string[])[],
  header = false,
): void {
  formatTable(rows).forEach((line, index) => {
    const text = header && index === 0 ? context.style.paint(line, 'dim') : line;
    writeLine(context, `  ${text}`);
  });
}
