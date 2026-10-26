import type { DifficultyClass } from '../core/config-schema.js';
import { AppError } from '../core/errors.js';

/** The model names of the config file. Each provider maps each class to one model. */
export type ModelConfig = Readonly<Record<string, Readonly<Record<DifficultyClass, string>>>>;

/**
 * Pick the model for a class. The config file wins. Without a config entry, the cheapest model
 * that fits the class is used. The adapter lists its models from the cheapest to the most
 * capable, so `simple` takes the first, `hard` takes the last, and `standard` takes the middle.
 */
export function pickModel(
  provider: string,
  difficulty: DifficultyClass,
  adapterModels: readonly string[],
  configModels: ModelConfig,
): string {
  const configured = configModels[provider.toLowerCase()]?.[difficulty];
  if (configured !== undefined) {
    return configured;
  }

  const model = adapterModels[defaultModelIndex(difficulty, adapterModels.length)];
  if (model === undefined) {
    throw new AppError('MODEL_MISSING', `The provider has no models: ${provider}`, {
      hint: 'Check the adapter for this provider.',
    });
  }

  return model;
}

/** Return the index of the default model for a class in a list of the given length. */
export function defaultModelIndex(difficulty: DifficultyClass, count: number): number {
  switch (difficulty) {
    case 'simple':
      return 0;
    case 'standard':
      return Math.floor((count - 1) / 2);
    case 'hard':
      return count - 1;
  }
}
