import { describe, expect, it, vi } from 'vitest';

import type { DifficultyClass } from '../src/core/config-schema.js';
import { answerWithEscalation, nextClass } from '../src/decision/escalation.js';
import { checkAnswer } from '../src/decision/quality-check.js';

const GOOD = 'Paris is the capital of France.';
const CUT_OFF = 'The three steps for the setup are: first, we open the file and then',
  REFUSAL = "I'm sorry, but I can't help with that request.";

/** An ask function that gives each answer in turn and records the classes it was asked at. */
function scripted(...answers: string[]) {
  const queue = [...answers];
  const asked: DifficultyClass[] = [];
  const ask = vi.fn(async (difficulty: DifficultyClass) => {
    asked.push(difficulty);
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('No more scripted answers.');
    }
    return next;
  });

  return { ask, asked };
}

describe('checkAnswer', () => {
  it('finds an empty answer', () => {
    expect(checkAnswer('')).toBe('empty');
    expect(checkAnswer('   \n  ')).toBe('empty');
  });

  it('finds an answer that is cut off in the middle of a sentence', () => {
    expect(checkAnswer(CUT_OFF)).toBe('cutOff');
  });

  it('finds a long answer that ends without punctuation', () => {
    expect(checkAnswer('This answer is long enough to count and it stops without an ending')).toBe(
      'cutOff',
    );
  });

  it('finds an open code fence', () => {
    expect(checkAnswer('Here is the code:\n```js\nconst x = 1;')).toBe('cutOff');
  });

  it('finds a refusal', () => {
    expect(checkAnswer(REFUSAL)).toBe('refusal');
    expect(checkAnswer('As an AI language model, I cannot provide that.')).toBe('refusal');
  });

  it('accepts a complete answer', () => {
    expect(checkAnswer(GOOD)).toBeUndefined();
    expect(checkAnswer('Paris')).toBeUndefined();
    expect(checkAnswer('```js\nconst x = 1;\n```')).toBeUndefined();
  });

  it('does not treat a normal sentence about a refusal as a refusal', () => {
    expect(checkAnswer('Some tools will not help you if the file is locked.')).toBeUndefined();
  });
});

describe('nextClass', () => {
  it('moves one class up and stops at hard', () => {
    expect(nextClass('simple')).toBe('standard');
    expect(nextClass('standard')).toBe('hard');
    expect(nextClass('hard')).toBeUndefined();
  });
});

describe('answerWithEscalation', () => {
  it('returns a good first answer without a second call', async () => {
    const { ask, asked } = scripted(GOOD);

    const result = await answerWithEscalation('simple', ask);

    expect(result).toEqual({ text: GOOD, difficulty: 'simple', escalated: false });
    expect(asked).toEqual(['simple']);
  });

  it.each([
    ['an empty answer', ''],
    ['a cut-off answer', CUT_OFF],
    ['a refusal', REFUSAL],
  ])('escalates once after %s', async (_name, badAnswer) => {
    const { ask, asked } = scripted(badAnswer, GOOD);

    const result = await answerWithEscalation('simple', ask);

    expect(asked).toEqual(['simple', 'standard']);
    expect(result).toEqual({ text: GOOD, difficulty: 'standard', escalated: true });
  });

  it('never escalates past one class, even when the second answer also fails', async () => {
    const { ask, asked } = scripted(REFUSAL, REFUSAL, GOOD);

    await answerWithEscalation('simple', ask);

    expect(asked).toEqual(['simple', 'standard']);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('returns the second answer with a warning when it also fails', async () => {
    const { ask } = scripted(REFUSAL, CUT_OFF);

    const result = await answerWithEscalation('simple', ask);

    expect(result).toEqual({
      text: CUT_OFF,
      difficulty: 'standard',
      escalated: true,
      warning: 'cutOff',
    });
  });

  it('keeps the first answer when the second answer is empty', async () => {
    const { ask } = scripted(CUT_OFF, '');

    const result = await answerWithEscalation('simple', ask);

    expect(result).toEqual({
      text: CUT_OFF,
      difficulty: 'simple',
      escalated: false,
      warning: 'cutOff',
    });
  });

  it('returns a failed answer at hard with a warning and makes no second call', async () => {
    const { ask, asked } = scripted(REFUSAL);

    const result = await answerWithEscalation('hard', ask);

    expect(asked).toEqual(['hard']);
    expect(result).toEqual({
      text: REFUSAL,
      difficulty: 'hard',
      escalated: false,
      warning: 'refusal',
    });
  });

  it('starts at standard and escalates to hard once', async () => {
    const { ask, asked } = scripted('', GOOD);

    const result = await answerWithEscalation('standard', ask);

    expect(asked).toEqual(['standard', 'hard']);
    expect(result.difficulty).toBe('hard');
  });
});
