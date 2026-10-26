import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classifyWithApi,
  truncatePrompt,
  MAX_PROMPT_CHARS,
} from '../src/decision/api-classifier.js';
import { classifyTask, type SecretReader } from '../src/decision/classifier.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import { SecretStore } from '../src/security/secret-store.js';
import { SessionVault } from '../src/security/session-vault.js';

const API_KEY = 'test-key-7f3a9c2e41b8';
const HARD_PROMPT = 'Prove that the square root of 2 is irrational.';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

let tempDir: string;
let dataPaths: DataPaths;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-classifier-'));
  dataPaths = {
    dataFolder: tempDir,
    configFile: path.join(tempDir, 'config.json'),
    databaseFile: path.join(tempDir, 'gauntlet.db'),
    sessionsFolder: path.join(tempDir, 'sessions'),
    keysFolder: path.join(tempDir, 'keys'),
    logsFolder: path.join(tempDir, 'logs'),
    keyFile: path.join(tempDir, 'keys', 'key.bin'),
    sessionFile: (accountId) => path.join(tempDir, 'sessions', `${String(accountId)}.enc`),
    logFile: (name) => path.join(tempDir, 'logs', `${name}.log`),
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

/** A response of the chat API with the given content. */
function answer(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fake fetch that gives each response in turn. */
function fakeFetch(...responses: Response[]): FetchMock {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('No more fake responses.');
    }
    return next;
  });
}

/** A fake fetch that never answers. It fails when the signal times out. */
function hangingFetch(): FetchMock {
  return vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason);
        });
      }),
  );
}

/** A secret reader with one saved key. */
function secretsWith(key: string | undefined): SecretReader {
  return { load: async () => key };
}

const baseOptions = {
  prompt: HARD_PROMPT,
  localOnly: false,
  provider: 'groq' as const,
  model: 'llama-3.1-8b-instant',
};

describe('classifyWithApi', () => {
  it('returns the class from a good answer and sends the key only in the header', async () => {
    const fetchMock = fakeFetch(answer('{"class":"hard"}'));

    const result = await classifyWithApi(HARD_PROMPT, {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      apiKey: API_KEY,
      fetch: fetchMock,
    });

    expect(result).toEqual({ kind: 'classified', class: 'hard' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).not.toContain(API_KEY);
    expect(JSON.stringify(init?.body ?? '')).not.toContain(API_KEY);
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${API_KEY}`);
  });

  it('sends only the truncated prompt', async () => {
    const fetchMock = fakeFetch(answer('{"class":"standard"}'));
    const longPrompt = 'a'.repeat(MAX_PROMPT_CHARS + 500);

    await classifyWithApi(longPrompt, {
      provider: 'openrouter',
      model: 'some-model',
      apiKey: API_KEY,
      fetch: fetchMock,
    });

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    expect(body.messages[1]?.content).toHaveLength(MAX_PROMPT_CHARS);
  });

  it('reports badJson when the answer is not JSON', async () => {
    const result = await classifyWithApi(HARD_PROMPT, {
      provider: 'groq',
      model: 'm',
      apiKey: API_KEY,
      fetch: fakeFetch(answer('the task is hard')),
    });

    expect(result).toEqual({ kind: 'failed', reason: 'badJson' });
  });

  it('reports badJson when the class is not one of the three classes', async () => {
    const result = await classifyWithApi(HARD_PROMPT, {
      provider: 'groq',
      model: 'm',
      apiKey: API_KEY,
      fetch: fakeFetch(answer('{"class":"expert"}')),
    });

    expect(result).toEqual({ kind: 'failed', reason: 'badJson' });
  });

  it('reports status for an error status', async () => {
    const result = await classifyWithApi(HARD_PROMPT, {
      provider: 'groq',
      model: 'm',
      apiKey: API_KEY,
      fetch: fakeFetch(new Response('rate limited', { status: 429 })),
    });

    expect(result).toEqual({ kind: 'failed', reason: 'status' });
  });

  it('reports timeout when the API does not answer in time', async () => {
    const result = await classifyWithApi(HARD_PROMPT, {
      provider: 'groq',
      model: 'm',
      apiKey: API_KEY,
      fetch: hangingFetch(),
      timeoutMs: 20,
    });

    expect(result).toEqual({ kind: 'failed', reason: 'timeout' });
  });

  it('reports network for a connection error', async () => {
    const result = await classifyWithApi(HARD_PROMPT, {
      provider: 'groq',
      model: 'm',
      apiKey: API_KEY,
      fetch: vi.fn<typeof fetch>(async () => {
        throw new TypeError('fetch failed');
      }),
    });

    expect(result).toEqual({ kind: 'failed', reason: 'network' });
  });

  it('truncates the prompt text', () => {
    expect(truncatePrompt(`  ${'b'.repeat(10)}  `, 4)).toBe('bbbb');
  });
});

describe('classifyTask', () => {
  it('uses the API class when the first call is good', async () => {
    const fetchMock = fakeFetch(answer('{"class":"simple"}'));

    const result = await classifyTask({
      ...baseOptions,
      secrets: secretsWith(API_KEY),
      fetch: fetchMock,
    });

    expect(result).toEqual({ class: 'simple', source: 'api', apiAttempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once after a bad answer and uses the second answer', async () => {
    const fetchMock = fakeFetch(answer('not json'), answer('{"class":"standard"}'));

    const result = await classifyTask({
      ...baseOptions,
      secrets: secretsWith(API_KEY),
      fetch: fetchMock,
    });

    expect(result).toEqual({ class: 'standard', source: 'api', apiAttempts: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the local rules after a bad answer twice', async () => {
    const fetchMock = fakeFetch(answer('not json'), answer('still not json'));

    const result = await classifyTask({
      ...baseOptions,
      secrets: secretsWith(API_KEY),
      fetch: fetchMock,
    });

    expect(result).toEqual({
      class: 'hard',
      source: 'local',
      apiAttempts: 2,
      lastFailure: 'badJson',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the local rules after a timeout', async () => {
    const result = await classifyTask({
      ...baseOptions,
      prompt: 'hi',
      secrets: secretsWith(API_KEY),
      fetch: hangingFetch(),
      timeoutMs: 20,
    });

    expect(result).toEqual({
      class: 'simple',
      source: 'local',
      apiAttempts: 2,
      lastFailure: 'timeout',
    });
  });

  it('falls back to the local rules after an error status', async () => {
    const fetchMock = fakeFetch(
      new Response('', { status: 500 }),
      new Response('', { status: 500 }),
    );

    const result = await classifyTask({
      ...baseOptions,
      secrets: secretsWith(API_KEY),
      fetch: fetchMock,
    });

    expect(result.source).toBe('local');
    expect(result.lastFailure).toBe('status');
  });

  it('makes no network call when localOnly is on', async () => {
    const fetchMock = fakeFetch(answer('{"class":"hard"}'));

    const result = await classifyTask({
      ...baseOptions,
      localOnly: true,
      secrets: secretsWith(API_KEY),
      fetch: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ class: 'hard', source: 'local', apiAttempts: 0 });
  });

  it('makes no network call when no key is saved', async () => {
    const fetchMock = fakeFetch(answer('{"class":"hard"}'));

    const result = await classifyTask({
      ...baseOptions,
      secrets: secretsWith(undefined),
      fetch: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.source).toBe('local');
  });

  it('never writes the API key to the console or to the result', async () => {
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];

    const failing = await classifyTask({
      ...baseOptions,
      secrets: secretsWith(API_KEY),
      fetch: vi.fn<typeof fetch>(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    const good = await classifyTask({
      ...baseOptions,
      secrets: secretsWith(API_KEY),
      fetch: fakeFetch(answer('{"class":"hard"}')),
    });

    for (const spy of logs) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(API_KEY);
      }
    }
    expect(JSON.stringify([failing, good])).not.toContain(API_KEY);
  });
});

describe('SecretStore', () => {
  function makeStore(): SecretStore {
    const vault = new SessionVault({ dataPaths, keyStore: new MemoryKeyStore() });
    return new SecretStore(vault);
  }

  it('saves a key and loads it back', async () => {
    const store = makeStore();

    await store.save('groq-key', API_KEY);

    expect(await store.load('groq-key')).toBe(API_KEY);
  });

  it('keeps the key encrypted on disk', async () => {
    const store = makeStore();

    await store.save('groq-key', API_KEY);

    const file = await readFile(dataPaths.sessionFile('secret-groq-key'));
    expect(file.toString('utf8')).not.toContain(API_KEY);
    expect(file.includes(Buffer.from(API_KEY))).toBe(false);
  });

  it('returns undefined for a key that was never saved', async () => {
    expect(await makeStore().load('openrouter-key')).toBeUndefined();
  });

  it('deletes a key', async () => {
    const store = makeStore();
    await store.save('groq-key', API_KEY);

    await store.delete('groq-key');

    expect(await store.load('groq-key')).toBeUndefined();
  });

  it('rejects a name with a path or a space', async () => {
    await expect(makeStore().save('../groq', API_KEY)).rejects.toThrow(
      'The secret name is not valid',
    );
    await expect(makeStore().save('groq key', API_KEY)).rejects.toThrow(
      'The secret name is not valid',
    );
  });

  it('rejects an empty value', async () => {
    await expect(makeStore().save('groq-key', '')).rejects.toThrow('The secret is empty.');
  });
});
