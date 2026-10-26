import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SecurityError } from '../src/core/errors.js';
import { MemoryKeyStore } from '../src/platform/memory/memory-key-store.js';
import type { DataPaths } from '../src/platform/types.js';
import {
  createNodeSessionFileStore,
  SessionVault,
  type SessionFileStore,
} from '../src/security/session-vault.js';

class MemoryFileStore implements SessionFileStore {
  readonly files = new Map<string, Buffer>();

  async read(filePath: string): Promise<Buffer> {
    const data = this.files.get(filePath);
    if (data === undefined) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }

    return Buffer.from(data);
  }

  async write(filePath: string, data: Buffer): Promise<void> {
    this.files.set(filePath, Buffer.from(data));
  }

  async delete(filePath: string): Promise<void> {
    this.files.delete(filePath);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }
}

function makeDataPaths(root: string): DataPaths {
  const sessionsFolder = path.join(root, 'sessions');
  const keysFolder = path.join(root, 'keys');
  const logsFolder = path.join(root, 'logs');

  return {
    dataFolder: root,
    configFile: path.join(root, 'config.json'),
    databaseFile: path.join(root, 'gauntlet.db'),
    sessionsFolder,
    keysFolder,
    logsFolder,
    keyFile: path.join(keysFolder, 'key.bin'),
    sessionFile: (accountId) => path.join(sessionsFolder, `${accountId}.enc`),
    logFile: (name) => path.join(logsFolder, `${name}.log`),
  };
}

function makeVault(): {
  vault: SessionVault;
  fileStore: MemoryFileStore;
  keyStore: MemoryKeyStore;
  dataPaths: DataPaths;
} {
  const dataPaths = makeDataPaths('C:\\data\\llm-gauntlet');
  const fileStore = new MemoryFileStore();
  const keyStore = new MemoryKeyStore();

  return {
    vault: new SessionVault({ dataPaths, keyStore, fileStore }),
    fileStore,
    keyStore,
    dataPaths,
  };
}

const sessionState = {
  cookies: [{ name: 'session', value: 'fake-cookie-value-for-tests', domain: '.example.test' }],
  origins: [{ origin: 'https://example.test', localStorage: [] }],
};

describe('SessionVault', () => {
  it('saves and loads the session state', async () => {
    const { vault } = makeVault();

    await vault.save('account-1', sessionState);
    const loaded = await vault.load('account-1');

    expect(loaded).toEqual(sessionState);
    expect(await vault.hasSession('account-1')).toBe(true);
  });

  it('writes no plain text to the session file', async () => {
    const { vault, fileStore, dataPaths } = makeVault();

    await vault.save('account-1', sessionState);

    const raw = fileStore.files.get(dataPaths.sessionFile('account-1'));
    expect(raw).toBeDefined();
    const text = raw?.toString('latin1') ?? '';
    expect(text).not.toContain('fake-cookie-value-for-tests');
    expect(text).not.toContain('example.test');
    expect(text).not.toContain('cookies');
  });

  it('fails to load a changed file', async () => {
    const { vault, fileStore, dataPaths } = makeVault();
    await vault.save('account-1', sessionState);

    const filePath = dataPaths.sessionFile('account-1');
    const raw = fileStore.files.get(filePath) ?? Buffer.alloc(0);
    const changed = Buffer.from(raw);
    const index = changed.length - 1;
    changed[index] = (changed[index] ?? 0) ^ 0xff;
    await fileStore.write(filePath, changed);

    await expect(vault.load('account-1')).rejects.toBeInstanceOf(SecurityError);
  });

  it('fails to load with a wrong key', async () => {
    const { vault, dataPaths, fileStore } = makeVault();
    await vault.save('account-1', sessionState);

    const otherKeyStore = new MemoryKeyStore();
    await otherKeyStore.setKey(Buffer.alloc(32, 9));
    const otherVault = new SessionVault({ dataPaths, keyStore: otherKeyStore, fileStore });

    await expect(otherVault.load('account-1')).rejects.toBeInstanceOf(SecurityError);
  });

  it('gives a clear error when the session file is missing', async () => {
    const { vault } = makeVault();

    await expect(vault.load('account-1')).rejects.toThrow(/No session state/);
    expect(await vault.hasSession('account-1')).toBe(false);
  });

  it('rejects a file that belongs to another account', async () => {
    const { vault, fileStore, dataPaths } = makeVault();
    await vault.save('account-1', sessionState);

    const source = dataPaths.sessionFile('account-1');
    const target = dataPaths.sessionFile('account-2');
    await fileStore.write(target, (await fileStore.read(source)) as Buffer);

    await expect(vault.load('account-2')).rejects.toBeInstanceOf(SecurityError);
  });

  it('uses a new nonce for each save', async () => {
    const { vault, fileStore, dataPaths } = makeVault();

    await vault.save('account-1', sessionState);
    const first = fileStore.files.get(dataPaths.sessionFile('account-1'));
    await vault.save('account-1', sessionState);
    const second = fileStore.files.get(dataPaths.sessionFile('account-1'));

    expect(first?.equals(second ?? Buffer.alloc(0))).toBe(false);
  });

  it('deletes the session file', async () => {
    const { vault } = makeVault();
    await vault.save('account-1', sessionState);

    await vault.delete('account-1');

    expect(await vault.hasSession('account-1')).toBe(false);
  });

  it('rejects a file with an unknown header', async () => {
    const { vault, fileStore, dataPaths } = makeVault();
    await fileStore.write(dataPaths.sessionFile('account-1'), Buffer.alloc(64, 1));

    await expect(vault.load('account-1')).rejects.toThrow(/unknown format/);
  });
});

describe('SessionVault with the real file store', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'llm-gauntlet-vault-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes an encrypted file in the sessions folder', async () => {
    const dataPaths = makeDataPaths(tempDir);
    const keyStore = new MemoryKeyStore();
    const vault = new SessionVault({ dataPaths, keyStore });

    await vault.save('account-1', sessionState);

    const raw = await readFile(dataPaths.sessionFile('account-1'));
    expect(raw.subarray(0, 4).toString('ascii')).toBe('LGSV');
    expect(raw.toString('latin1')).not.toContain('fake-cookie-value-for-tests');
    await expect(vault.load('account-1')).resolves.toEqual(sessionState);
  });

  it('deletes a missing file without an error', async () => {
    const dataPaths = makeDataPaths(tempDir);
    const vault = new SessionVault({
      dataPaths,
      keyStore: new MemoryKeyStore(),
      fileStore: createNodeSessionFileStore(),
    });

    await expect(vault.delete('missing')).resolves.toBeUndefined();
  });
});
