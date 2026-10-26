import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlannedError, PlatformError, SecurityError } from '../src/core/errors.js';
import { createPlatform, KEY_LENGTH_BYTES } from '../src/platform/index.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';

describe('createPlatform', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives a planned error on Linux', () => {
    expect(() => createPlatform('linux')).toThrow(PlannedError);
    expect(() => createPlatform('linux')).toThrow(/Linux is Planned/);
  });

  it('gives a planned error on macOS', () => {
    expect(() => createPlatform('darwin')).toThrow(/macOS is Planned/);
  });

  it('uses process.platform by default', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    expect(() => createPlatform()).toThrow(/Linux is Planned/);
  });

  it('gives an error for an unknown platform', () => {
    expect(() => createPlatform('aix')).toThrow(PlatformError);
  });

  it.skipIf(process.platform !== 'win32')('returns the Windows code on win32', () => {
    const platform = createPlatform('win32');

    expect(platform.dataPaths.dataFolder).toContain('llm-gauntlet');
    expect(typeof platform.keyStore.getKey).toBe('function');
    expect(typeof platform.shellRunner.run).toBe('function');
  });
});

describe('MemoryKeyStore', () => {
  it('makes a key on the first read and keeps it', async () => {
    const store = new MemoryKeyStore();
    expect(await store.hasKey()).toBe(false);

    const key = await store.getKey();

    expect(key).toHaveLength(KEY_LENGTH_BYTES);
    expect(await store.hasKey()).toBe(true);
    expect(await store.getKey()).toEqual(key);
  });

  it('stores a given key and deletes it', async () => {
    const store = new MemoryKeyStore();
    const key = Buffer.alloc(KEY_LENGTH_BYTES, 7);

    await store.setKey(key);

    expect((await store.getKey()).equals(key)).toBe(true);

    await store.deleteKey();

    expect(await store.hasKey()).toBe(false);
  });

  it('returns a copy of the key', async () => {
    const store = new MemoryKeyStore();
    const first = await store.getKey();

    first.fill(0);

    const second = await store.getKey();
    expect(second.equals(first)).toBe(false);
  });

  it('rejects a key with the wrong length', async () => {
    const store = new MemoryKeyStore();

    await expect(store.setKey(Buffer.alloc(16))).rejects.toBeInstanceOf(SecurityError);
  });
});
