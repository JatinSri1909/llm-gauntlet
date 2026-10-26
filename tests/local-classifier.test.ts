import { describe, expect, it } from 'vitest';

import { classifyLocally, LONG_PROMPT_CHARS } from '../src/decision/local-classifier.js';

const CASES: ReadonlyArray<readonly [string, string, 'simple' | 'standard' | 'hard']> = [
  ['a greeting', 'hi', 'simple'],
  ['a short fact question', 'What is the capital of France?', 'simple'],
  ['a short translation', "Translate 'good morning' into Spanish.", 'simple'],
  ['a short definition', 'Define photosynthesis in one line.', 'simple'],
  ['a moderate writing task', 'Write a short email asking for a meeting next week.', 'standard'],
  ['a summary request', 'Summarize the main idea of this paragraph in two sentences.', 'standard'],
  ['a code block', 'Why does this fail?\n```js\nconst x = y.map();\n```', 'hard'],
  ['a proof request', 'Prove that the square root of 2 is irrational.', 'hard'],
  ['an optimisation request', 'Optimize this loop so it runs faster.', 'hard'],
  ['a design request', 'Design an architecture for a multi-tenant billing system.', 'hard'],
  ['a refactor request', 'Refactor the login module to remove duplicate code.', 'hard'],
  [
    'a hard word after a simple start',
    'What is a closure, and how does it relate to a race condition?',
    'hard',
  ],
  ['a very long prompt', 'Explain the history of the printing press. '.repeat(40), 'hard'],
];

describe('classifyLocally', () => {
  it.each(CASES)('classifies %s as %s', (_name, prompt, expected) => {
    expect(classifyLocally(prompt)).toBe(expected);
  });

  it('ignores the spaces around the prompt', () => {
    expect(classifyLocally('   hi   ')).toBe('simple');
  });

  it('treats a prompt at the long limit as not long', () => {
    const prompt = 'Describe a bridge. '.repeat(Math.floor(LONG_PROMPT_CHARS / 20)).trim();

    expect(prompt.length).toBeLessThanOrEqual(LONG_PROMPT_CHARS);
    expect(classifyLocally(prompt)).toBe('standard');
  });
});
