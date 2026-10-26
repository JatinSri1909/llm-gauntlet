import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, loadConfig, parseConfig } from '../src/core/config.js';
import { ConfigError } from '../src/core/errors.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-config-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function captureConfigError(action: () => unknown): ConfigError {
  try {
    action();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }

  throw new Error('Expected a ConfigError.');
}

describe('config', () => {
  it('uses the default values', () => {
    expect(DEFAULT_CONFIG.localOnly).toBe(false);
    expect(DEFAULT_CONFIG.logLevel).toBe('info');
    expect(DEFAULT_CONFIG.classifier.provider).toBe('groq');
    expect(DEFAULT_CONFIG.context.maxTokens).toBe(4000);
    expect(DEFAULT_CONFIG.usage.windowHours).toBe(24);
    expect(DEFAULT_CONFIG.models).toEqual({});
  });

  it('checks the localOnly option', () => {
    const config = parseConfig({ localOnly: true });

    expect(config.localOnly).toBe(true);
  });

  it('gives a clear error for a bad value', () => {
    const error = captureConfigError(() => parseConfig({ localOnly: 'yes' }));

    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.hint).toContain('localOnly');
  });

  it('gives a clear error for an unknown key', () => {
    const error = captureConfigError(() => parseConfig({ typo: true }));

    expect(error.hint).toContain('typo');
  });

  it('loads a valid file and fills the defaults', async () => {
    const filePath = path.join(tempDir, 'config.json');
    await writeFile(filePath, JSON.stringify({ localOnly: true }), 'utf8');

    const config = await loadConfig(filePath);

    expect(config.localOnly).toBe(true);
    expect(config.context.recentMessages).toBe(6);
  });

  it('returns the defaults when the file does not exist', async () => {
    const config = await loadConfig(path.join(tempDir, 'missing.json'));

    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('gives a clear error for bad JSON', async () => {
    const filePath = path.join(tempDir, 'config.json');
    await writeFile(filePath, '{', 'utf8');

    await expect(loadConfig(filePath)).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts a UTF-8 byte order mark', async () => {
    const filePath = path.join(tempDir, 'config.json');
    await writeFile(filePath, '\uFEFF{"localOnly":true}', 'utf8');

    const config = await loadConfig(filePath);

    expect(config.localOnly).toBe(true);
  });
});
