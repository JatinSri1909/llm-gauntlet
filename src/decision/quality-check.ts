/** A problem that the local check finds in an answer. */
export type QualityProblem = 'empty' | 'cutOff' | 'refusal';

/** Phrases that start a refusal. The check is case-insensitive. */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  /\bI(?:'m| am) (?:sorry,? but )?(?:not able|unable) to (?:help|assist|provide|comply)\b/i,
  /\bI (?:can(?:not|'t)|won't|will not) (?:help|assist|provide|comply|do that)\b/i,
  /\bas an AI(?: language model)?,? I (?:can(?:not|'t)|am unable)\b/i,
];

/** The last characters that show an answer stopped in the middle of a sentence. */
const OPEN_ENDINGS = new Set([',', ';', ':', '(', '[', '{', '-']);

/** The last characters of a finished sentence, a list item, or a code block. */
const SENTENCE_END = /[.!?)\]}"'`*|>]$/;

/** A shorter answer can end without punctuation, such as a single word. It is not cut off. */
const MIN_CUT_OFF_CHARS = 40;

/**
 * Check an answer with local rules. It returns the first problem found, or undefined when the
 * answer looks complete. An answer is cut off when a code fence is open, it ends with an open
 * character, or a long answer ends with no sentence punctuation. These are heuristics.
 */
export function checkAnswer(text: string): QualityProblem | undefined {
  const answer = text.trim();

  if (answer === '') {
    return 'empty';
  }

  const fenceCount = answer.match(/```/g)?.length ?? 0;
  const endsOpen = OPEN_ENDINGS.has(answer.slice(-1));
  const endsWithoutPunctuation = answer.length >= MIN_CUT_OFF_CHARS && !SENTENCE_END.test(answer);

  if (fenceCount % 2 === 1 || endsOpen || endsWithoutPunctuation) {
    return 'cutOff';
  }

  if (REFUSAL_PATTERNS.some((pattern) => pattern.test(answer))) {
    return 'refusal';
  }

  return undefined;
}
