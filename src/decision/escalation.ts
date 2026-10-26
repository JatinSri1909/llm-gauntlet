import type { DifficultyClass } from '../core/config-schema.js';
import { AppError } from '../core/errors.js';

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
  /** Why the second call did not finish. The first answer is returned then. */
  readonly notice?: string;
}

/** The options of the escalation. */
export interface EscalationOptions {
  /**
   * Return false when the next class would send the same request again, for example to the same
   * account with the same model. The first answer is kept then.
   */
  readonly canEscalate?: (difficulty: DifficultyClass) => boolean;
}

/**
 * Ask at the starting class. When the check fails, ask once more at the next class. Stop after
 * the second answer, even when it fails. Return the second answer, unless it is empty and the
 * first one is not. A failed final answer carries a warning. An error on the second call keeps
 * the first answer, so a good answer is never lost.
 */
export async function answerWithEscalation(
  startClass: DifficultyClass,
  ask: (difficulty: DifficultyClass) => Promise<string>,
  options: EscalationOptions = {},
): Promise<EscalatedAnswer> {
  const firstText = await ask(startClass);
  const firstProblem = checkAnswer(firstText);

  const higher = nextClass(startClass);
  const mayEscalate = higher !== undefined && (options.canEscalate?.(higher) ?? true);
  if (firstProblem === undefined || higher === undefined || !mayEscalate) {
    return finish(firstText, startClass, false, firstProblem);
  }

  let secondText: string;
  try {
    secondText = await ask(higher);
  } catch (error) {
    // Any failure of the second call keeps the first answer. A good answer is never lost.
    const reason =
      error instanceof AppError ? error.message : 'an unexpected error stopped the second request';
    return { ...finish(firstText, startClass, false, firstProblem), notice: reason };
  }

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
