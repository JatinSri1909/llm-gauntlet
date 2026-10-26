import type { DifficultyClass } from '../core/config-schema.js';

import { checkAnswer, type QualityProblem } from './quality-check.js';

/** The next class up, or undefined when the class is already the highest. */
export function nextClass(difficulty: DifficultyClass): DifficultyClass | undefined {
  switch (difficulty) {
    case 'simple':
      return 'standard';
    case 'standard':
      return 'hard';
    case 'hard':
      return undefined;
  }
}

/** The answer that the escalation returns. */
export interface EscalatedAnswer {
  readonly text: string;
  /** The class of the call that gave the returned text. */
  readonly difficulty: DifficultyClass;
  /** True when the second call, at the next class, was made. */
  readonly escalated: boolean;
  /** The problem of the returned text, when the checks failed. It is set on the final answer. */
  readonly warning?: QualityProblem;
}

/**
 * Ask at the starting class. When the check fails, ask once more at the next class. Stop after
 * the second answer, even when it fails. Return the second answer, unless it is empty and the
 * first one is not. A failed final answer carries a warning.
 */
export async function answerWithEscalation(
  startClass: DifficultyClass,
  ask: (difficulty: DifficultyClass) => Promise<string>,
): Promise<EscalatedAnswer> {
  const firstText = await ask(startClass);
  const firstProblem = checkAnswer(firstText);

  const higher = nextClass(startClass);
  if (firstProblem === undefined || higher === undefined) {
    return finish(firstText, startClass, false, firstProblem);
  }

  const secondText = await ask(higher);
  const secondProblem = checkAnswer(secondText);

  const useFirst = secondProblem === 'empty' && firstProblem !== 'empty';
  if (useFirst) {
    return finish(firstText, startClass, false, firstProblem);
  }

  return finish(secondText, higher, true, secondProblem);
}

function finish(
  text: string,
  difficulty: DifficultyClass,
  escalated: boolean,
  problem: QualityProblem | undefined,
): EscalatedAnswer {
  return {
    text,
    difficulty,
    escalated,
    ...(problem === undefined ? {} : { warning: problem }),
  };
}
