import { z } from 'zod';

import { DIFFICULTY_CLASSES, type DifficultyClass } from '../core/config-schema.js';

/** The free providers that can classify a task. */
export const CLASSIFIER_PROVIDERS = ['groq', 'openrouter'] as const;

/** The name of a classifier provider. */
export type ClassifierProvider = (typeof CLASSIFIER_PROVIDERS)[number];

/** The chat endpoint of each provider. Both use the same request and answer format. */
const ENDPOINTS: Readonly<Record<ClassifierProvider, string>> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

/** Only this many characters of the prompt go to the API. The rest stays on this machine. */
export const MAX_PROMPT_CHARS = 2000;

/** The time limit of one classifier call. */
export const DEFAULT_TIMEOUT_MS = 10_000;

const SYSTEM_PROMPT =
  'Classify how hard the user task is. Reply with only a JSON object like {"class":"standard"}. ' +
  `The class is one of: ${DIFFICULTY_CLASSES.join(', ')}.`;

/** Why a classifier call did not give a class. */
export type ApiFailureReason = 'timeout' | 'network' | 'status' | 'badJson';

/** The result of one classifier call. */
export type ApiClassifyResult =
  | { readonly kind: 'classified'; readonly class: DifficultyClass }
  | { readonly kind: 'failed'; readonly reason: ApiFailureReason };

/** The options of one classifier call. */
export interface ApiClassifierOptions {
  readonly provider: ClassifierProvider;
  readonly model: string;
  /** The API key. It goes only in the authorization header. */
  readonly apiKey: string;
  /** The fetch function. The default is the global fetch. The tests replace it. */
  readonly fetch?: typeof fetch;
  /** The time limit in milliseconds. */
  readonly timeoutMs?: number;
}

const answerSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const classSchema = z.object({ class: z.enum(DIFFICULTY_CLASSES) });

/** Cut a prompt to the length that the API may receive. */
export function truncatePrompt(text: string, maxChars = MAX_PROMPT_CHARS): string {
  return text.trim().slice(0, maxChars);
}

/**
 * Ask a free chat API for the class of a task. It returns a failure reason instead of
 * throwing, so the caller can retry or use the local rules. The error text never holds the key.
 */
export async function classifyWithApi(
  text: string,
  options: ApiClassifierOptions,
): Promise<ApiClassifyResult> {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchFn(ENDPOINTS[options.provider], {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        max_tokens: 20,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: truncatePrompt(text) },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { kind: 'failed', reason: isTimeoutError(error) ? 'timeout' : 'network' };
  }

  if (!response.ok) {
    return { kind: 'failed', reason: 'status' };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    return { kind: 'failed', reason: isTimeoutError(error) ? 'timeout' : 'badJson' };
  }

  return parseAnswer(payload);
}

/** Check the answer of the API. A bad answer gives the reason badJson. */
export function parseAnswer(payload: unknown): ApiClassifyResult {
  const answer = answerSchema.safeParse(payload);
  if (!answer.success) {
    return { kind: 'failed', reason: 'badJson' };
  }

  const content = answer.data.choices[0]?.message.content ?? '';

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { kind: 'failed', reason: 'badJson' };
  }

  const parsed = classSchema.safeParse(value);
  if (!parsed.success) {
    return { kind: 'failed', reason: 'badJson' };
  }

  return { kind: 'classified', class: parsed.data.class };
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
