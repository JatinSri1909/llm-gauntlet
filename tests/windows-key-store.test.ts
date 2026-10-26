import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SecurityError } from '../src/core/errors.js';
import { createWindowsDataPaths } from '../src/platform/windows/data-paths.js';
import { WindowsKeyStore } from '../src/platform/windows/key-store.js';
import type { ShellResult, ShellRunOptions } from '../src/platform/types.js';
import { WindowsShellRunner } from '../src/platform/windows/shell-runner.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-key-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function createStore(): { store: WindowsKeyStore; keyFile: string } {
  const dataPaths = createWindowsDataPaths({ env: { LOCALAPPDATA: tempDir } });
  return {
    store: new WindowsKeyStore({ dataPaths }),
    keyFile: dataPaths.keyFile,
  };
}

describe.skipIf(process.platform !== 'win32')('WindowsKeyStore', () => {
  it('makes a key, stores it, and reads it back', async () => {
    const { store } = createStore();

    const key = await store.getKey();
    const second = await store.getKey();

    expect(key).toHaveLength(32);
    expect(second.equals(key)).toBe(true);
    expect(await store.hasKey()).toBe(true);
  });

  it('gives every process the same key when two start at the same moment', async () => {
    const first = createStore();
    const second = createStore();

    const [one, two] = await Promise.all([first.store.getKey(), second.store.getKey()]);

    expect(one.equals(two)).toBe(true);
    expect((await createStore().store.getKey()).equals(one)).toBe(true);
  });

  it('reads the same key from a second store', async () => {
    const first = createStore();
    const key = await first.store.getKey();

    const second = createStore();
    const readBack = await second.store.getKey();

    expect(readBack.equals(key)).toBe(true);
  });

  it('writes no plain text key to the file', async () => {
    const { store, keyFile } = createStore();
    const key = await store.getKey();

    const fileContent = await readFile(keyFile, 'utf8');

    expect(fileContent.trim()).not.toBe(key.toString('base64'));
    expect(fileContent).not.toContain(key.toString('hex'));
    expect(Buffer.from(fileContent.trim(), 'base64').equals(key)).toBe(false);
  });

  it('deletes the key', async () => {
    const { store } = createStore();
    await store.getKey();

    await store.deleteKey();

    expect(await store.hasKey()).toBe(false);
  });

  it('rejects a key with the wrong length', async () => {
    const { store } = createStore();

    await expect(store.setKey(Buffer.alloc(16))).rejects.toBeInstanceOf(SecurityError);
  });

  it('rejects a damaged key file', async () => {
    const { keyFile } = createStore();
    const dataPaths = createWindowsDataPaths({ env: { LOCALAPPDATA: tempDir } });
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(keyFile), { recursive: true });
    await writeFile(keyFile, 'not-a-wrapped-key', 'utf8');

    const poisoned = new WindowsKeyStore({ dataPaths });

    await expect(poisoned.getKey()).rejects.toBeInstanceOf(SecurityError);
  });
});

describe.skipIf(process.platform !== 'win32')('WindowsKeyStore key handling', () => {
  it('sends the key through stdin and never in the arguments', async () => {
    const dataPaths = createWindowsDataPaths({ env: { LOCALAPPDATA: tempDir } });
    const seen: Array<{ program: string; args: readonly string[]; input?: string }> = [];

    class SpyShellRunner extends WindowsShellRunner {
      override run(
        program: string,
        args: readonly string[],
        options: ShellRunOptions = {},
      ): Promise<ShellResult> {
        seen.push({
          program,
          args,
          ...(options.input === undefined ? {} : { input: options.input }),
        });
        return super.run(program, args, options);
      }
    }

    const spyRunner = new SpyShellRunner();

    const store = new WindowsKeyStore({ dataPaths, shellRunner: spyRunner });
    const key = await store.getKey();
    const base64Key = key.toString('base64');

    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      expect(call.program.endsWith('powershell.exe')).toBe(true);
      // The execution policy only applies to script files. The helper runs as an encoded command, so no policy flag is passed.
      expect(call.args).not.toContain('-ExecutionPolicy');
      expect(call.args).not.toContain('Bypass');
      expect(call.args.join(' ')).not.toContain(base64Key);
      expect(call.args.join(' ')).not.toContain(key.toString('hex'));
      expect(call.input).toBe(base64Key);
    }
  });
});
