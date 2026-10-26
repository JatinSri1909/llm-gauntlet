import { readFile } from 'node:fs/promises';

import { loadConfig, parseConfig } from '../core/config.js';
import { AppError, ConfigError } from '../core/errors.js';
import { SafeFileSystem } from '../platform/windows/safe-fs.js';

/** The inputs of the settings functions. */
export interface SettingsOptions {
  /** The config file of this machine. */
  readonly configFile: string;
  /** Write the file text. The default uses the safe file code. The tests replace it. */
  readonly writeFile?: (filePath: string, text: string) => Promise<void>;
}

/** A setting name is dots between words. Example: `context.maxTokens`. */
const KEY_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

/** Names that would change the object prototype. A setting never uses them. */
const FORBIDDEN_KEY_PARTS = new Set(['__proto__', 'constructor', 'prototype']);

/** Return every setting, with the defaults, as JSON text. */
export async function listSettings(options: SettingsOptions): Promise<string> {
  const config = await loadConfig(options.configFile);
  return JSON.stringify(config, null, 2);
}

/** Return the value of one setting as text. An unknown setting is an error. */
export async function getSetting(options: SettingsOptions, key: string): Promise<string> {
  const config = await loadConfig(options.configFile);
  const value = readPath(config, parseKey(key));

  if (value === undefined) {
    throw unknownSetting(key);
  }

  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

/**
 * Set one setting and save the config file. The new file must pass the config schema, so a bad
 * value leaves the file as it was. The value is read as JSON when it is valid JSON, and as text
 * otherwise. It returns a short message.
 */
export async function setSetting(
  options: SettingsOptions,
  key: string,
  text: string,
): Promise<string> {
  const segments = parseKey(key);
  const value = parseValue(text);
  const current = await readRawConfig(options.configFile);
  const next = withPath(current, segments, value);

  parseConfig(next);

  const write = options.writeFile ?? defaultWriteFile;
  await write(options.configFile, `${JSON.stringify(next, null, 2)}\n`);

  return `Set ${key} to ${JSON.stringify(value)}.`;
}

/** Check a setting name and split it into its parts. */
function parseKey(key: string): string[] {
  const segments = key.split('.');
  const hasForbiddenPart = segments.some((segment) => FORBIDDEN_KEY_PARTS.has(segment));

  if (!KEY_PATTERN.test(key) || hasForbiddenPart) {
    throw new ConfigError(`The setting name is not valid: ${key}`, {
      hint: 'Use names with dots between the words. Example: context.maxTokens.',
    });
  }

  return key.split('.');
}

/** Read a value as JSON when it is valid JSON. Otherwise the text is the value. */
function parseValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Read the file as it is saved, without the defaults. A missing file is an empty object. */
async function readRawConfig(filePath: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return {};
    }

    throw new AppError('CONFIG_ERROR', `Cannot read the config file: ${filePath}`, {
      hint: 'Check that you can read the file.',
      cause: error,
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw new ConfigError(`The config file is not valid JSON: ${filePath}`, {
      hint: 'Fix the JSON syntax or delete the file, then try again.',
      cause: error,
    });
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError('The config file must hold a JSON object.', {
      hint: 'Fix the file or delete it, then try again.',
    });
  }

  return value as Record<string, unknown>;
}

/** Return a copy of the object with one value set at the path. */
function withPath(
  object: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const copy = structuredClone(object);
  let parent: Record<string, unknown> = copy;

  for (const segment of segments.slice(0, -1)) {
    const child = parent[segment];
    if (child === undefined) {
      const created: Record<string, unknown> = {};
      parent[segment] = created;
      parent = created;
    } else if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      parent = child as Record<string, unknown>;
    } else {
      throw new ConfigError(`Cannot set ${segments.join('.')}: ${segment} is not an object.`, {
        hint: 'Check the config file for the setting above this one.',
      });
    }
  }

  const last = segments[segments.length - 1] ?? '';
  parent[last] = value;
  return copy;
}

/** Return the value at the path, or undefined when a part is missing. */
function readPath(config: unknown, segments: readonly string[]): unknown {
  let current: unknown = config;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function unknownSetting(key: string): ConfigError {
  return new ConfigError(`Unknown setting: ${key}`, {
    hint: 'Run "gauntlet config" to list the settings.',
  });
}

async function defaultWriteFile(filePath: string, text: string): Promise<void> {
  await new SafeFileSystem().writeFileAtomic(filePath, text);
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
