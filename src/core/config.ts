import { readFile } from 'node:fs/promises';

import { configSchema, type Config } from './config-schema.js';
import { ConfigError } from './errors.js';

export type { Config } from './config-schema.js';

/** Check a config value and set the defaults. */
export function parseConfig(value: unknown): Config {
  const result = configSchema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const location = issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.');
        return `${location}: ${issue.message}`;
      })
      .join('; ');

    throw new ConfigError('The config file is not valid.', {
      hint: `Fix these values: ${details}`,
      cause: result.error,
    });
  }

  return result.data;
}

/** The config values that apply when the file has no value. */
export const DEFAULT_CONFIG: Config = parseConfig({});

/** Read a config file. A missing file gives the default values. */
export async function loadConfig(filePath: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return parseConfig({});
    }

    throw new ConfigError(`Cannot read the config file: ${filePath}`, {
      hint: 'Check that the file exists and that you can read it.',
      cause: error,
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new ConfigError(`The config file is not valid JSON: ${filePath}`, {
      hint: 'Fix the JSON syntax and try again.',
      cause: error,
    });
  }

  return parseConfig(value);
}

function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}
