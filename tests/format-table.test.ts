import { describe, expect, it } from 'vitest';

import { formatTable } from '../src/interactive/render.js';

describe('formatTable', () => {
  it('pads each column to its longest cell and leaves the last column as it is', () => {
    const lines = formatTable([
      ['PROVIDER', 'LABEL', 'STATE'],
      ['claude', 'student-one', 'ready'],
      ['alpha', 'b', 'cooling down'],
    ]);

    expect(lines).toEqual([
      'PROVIDER  LABEL        STATE',
      'claude    student-one  ready',
      'alpha     b            cooling down',
    ]);
  });

  it('returns no lines for no rows', () => {
    expect(formatTable([])).toEqual([]);
  });
});
