import type { DifficultyClass } from '../core/config-schema.js';

/** A prompt longer than this many characters is treated as a hard task. */
export const LONG_PROMPT_CHARS = 1000;

/** A prompt shorter than this many characters can be simple, when no hard word appears. */
export const SHORT_PROMPT_CHARS = 120;

/** Words and shapes that mark a hard task. A match of any pattern makes the task hard. */
const HARD_PATTERNS: readonly RegExp[] = [
  /```/,
  /\b(?:prove|proof|derive|theorem|algorithm|complexity|optimi[sz]e|debug|refactor|architect(?:ure)?|concurrency|race condition|step[- ]by[- ]step)\b/i,
];

/** Words that start a simple task. The prompt must also be short. */
const SIMPLE_PATTERNS: readonly RegExp[] = [
  /^(?:hi|hello|hey|thanks|thank you)\b/i,
  /^(?:what is|who is|define|translate|spell|convert)\b/i,
];

/**
 * Classify a task as `simple`, `standard`, or `hard` with local rules.
 * A hard word or a very long prompt makes the task hard. A short prompt that starts with a simple
 * word is simple. Every other task is standard. The rules never use the network.
 */
export function classifyLocally(text: string): DifficultyClass {
  const prompt = text.trim();

  if (prompt.length > LONG_PROMPT_CHARS || HARD_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return 'hard';
  }

  if (
    prompt.length <= SHORT_PROMPT_CHARS &&
    SIMPLE_PATTERNS.some((pattern) => pattern.test(prompt))
  ) {
    return 'simple';
  }

  return 'standard';
}
