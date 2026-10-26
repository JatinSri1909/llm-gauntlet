import type { DifficultyClass } from '../core/config-schema.js';

import {
  classifyWithApi,
  type ApiFailureReason,
  type ClassifierProvider,
} from './api-classifier.js';
import { classifyLocally } from './local-classifier.js';

/** The number of API calls for one task. The first call and one retry. */
const API_ATTEMPTS = 2;

/** Read a saved secret by its name. The secret store implements this. */
export interface SecretReader {
  load(name: string): Promise<string | undefined>;
}

/** The options of one classification. */
export interface ClassifyOptions {
  readonly prompt: string;
  /** When true, the prompt never leaves this machine. */
  readonly localOnly: boolean;
  readonly provider: ClassifierProvider;
  readonly model: string;
  readonly secrets: SecretReader;
  /** The fetch function. The tests replace it. */
  readonly fetch?: typeof fetch;
  /** The time limit of one API call in milliseconds. */
  readonly timeoutMs?: number;
}

/** The class of a task and the way it was found. */
export interface ClassifyResult {
  readonly class: DifficultyClass;
  /** `api` when the free API gave the class. `local` when the local rules gave it. */
  readonly source: 'api' | 'local';
  /** The number of API calls made. */
  readonly apiAttempts: number;
  /** The reason of the last API failure, when the local rules were used after a failure. */
  readonly lastFailure?: ApiFailureReason;
}

/** The name of the saved API key of a provider. */
export function apiKeyName(provider: ClassifierProvider): string {
  return `${provider}-key`;
}

/**
 * Classify a task. Use the free API when it is on and a key is saved. Retry the API once after a
 * failure. Use the local rules when the API is off, has no key, or fails twice.
 */
export async function classifyTask(options: ClassifyOptions): Promise<ClassifyResult> {
  const localClass = (): ClassifyResult => ({
    class: classifyLocally(options.prompt),
    source: 'local',
    apiAttempts: 0,
  });

  if (options.localOnly) {
    return localClass();
  }

  const apiKey = await options.secrets.load(apiKeyName(options.provider));
  if (apiKey === undefined) {
    return localClass();
  }

  let attempts = 0;
  let lastFailure: ApiFailureReason | undefined;

  while (attempts < API_ATTEMPTS) {
    attempts += 1;
    const result = await classifyWithApi(options.prompt, {
      provider: options.provider,
      model: options.model,
      apiKey,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });

    if (result.kind === 'classified') {
      return { class: result.class, source: 'api', apiAttempts: attempts };
    }

    lastFailure = result.reason;
  }

  return {
    ...localClass(),
    apiAttempts: attempts,
    ...(lastFailure === undefined ? {} : { lastFailure }),
  };
}
