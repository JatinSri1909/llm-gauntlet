/** A problem that the local check finds in an answer. */
export type QualityProblem = 'empty' | 'cutOff' | 'refusal';

/** Phrases that start a refusal. The check is case-insensitive. */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  /\bI(?:'m| am) (?:sorry,? but )?(?:not able|unable) to (?:help|assist|provide|comply)\b(?! but)/i,
  /\bI (?:can(?:not|'t)|won't|will not) (?:help|assist|provide|comply|do that)\b(?! but)/i,
  /\bas an AI(?: language model)?,? I (?:can(?:not|'t)|am unable)\b/i,
];

/** The last characters that show an answer stopped in the middle of a sentence. */
const OPEN_ENDINGS = new Set([',', ';', ':', '(', '[', '{', '-']);

/**
 * Check an answer with local rules. It returns the first problem found, or undefined when the
 * answer looks complete. An answer is cut off when a code fence is open or it ends with an open
 * character. Other endings, such as a number, a URL, or a plain word, are accepted, because a
 * wrong cut-off flag costs a second request.
 */
export function checkAnswer(text: string): QualityProblem | undefined {
  const answer = text.trim();

  if (answer === '') {
    return 'empty';
  }

  const fenceCount = answer.match(/```/g)?.length ?? 0;
  if (fenceCount % 2 === 1 || OPEN_ENDINGS.has(answer.slice(-1))) {
    return 'cutOff';
  }

  if (REFUSAL_PATTERNS.some((pattern) => pattern.test(answer))) {
    return 'refusal';
  }

  return undefined;
}
