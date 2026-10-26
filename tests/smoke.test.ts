import { describe, expect, it } from 'vitest';

import { APP_NAME } from '../src/index.js';

describe('application name', () => {
  it('exports the project name', () => {
    expect(APP_NAME).toBe('llm-gauntlet');
  });
});
