import { describe, expect, it } from 'vitest';

import { FileError } from '../src/core/errors.js';
import { SafeFileSystem, toLongPath, type FileSystem } from '../src/platform/windows/safe-fs.js';

class FakeFileSystem implements FileSystem {
  readonly writes: Array<{ path: string; data: Uint8Array | string }> = [];
  readonly renames: Array<{ from: string; to: string }> = [];
  readonly unlinks: string[] = [];
  mkdirCount = 0;

  private remainingWriteFailures = 0;
  private remainingRenameFailures = 0;
  private writeError: NodeJS.ErrnoException | undefined;
  private renameError: NodeJS.ErrnoException | undefined;
  private unlinkError: NodeJS.ErrnoException | undefined;

  failWrites(count: number, code: string): void {
    this.remainingWriteFailures = count;
    this.writeError = errno(code);
  }

  failRenames(count: number, code: string): void {
    this.remainingRenameFailures = count;
    this.renameError = errno(code);
  }

  failUnlinks(code: string): void {
    this.unlinkError = errno(code);
  }

  async mkdir(): Promise<void> {
    this.mkdirCount += 1;
  }

  async readFile(): Promise<Buffer> {
    return Buffer.from('data');
  }

  async writeFile(filePath: string, data: Uint8Array | string): Promise<void> {
    if (this.remainingWriteFailures > 0) {
      this.remainingWriteFailures -= 1;
      throw this.writeError ?? errno('EBUSY');
    }

    this.writes.push({ path: filePath, data });
  }

  async rename(from: string, to: string): Promise<void> {
    if (this.remainingRenameFailures > 0) {
      this.remainingRenameFailures -= 1;
      throw this.renameError ?? errno('EPERM');
    }

    this.renames.push({ from, to });
  }

  async unlink(filePath: string): Promise<void> {
    if (this.unlinkError !== undefined) {
      throw this.unlinkError;
    }

    this.unlinks.push(filePath);
  }
}

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function makeSafeFileSystem(
  fs: FakeFileSystem,
  sleep: (milliseconds: number) => Promise<void>,
  maxAttempts = 5,
): SafeFileSystem {
  return new SafeFileSystem({
    fs,
    sleep,
    platform: 'win32',
    maxAttempts,
    retryDelayMs: 10,
  });
}

describe.skipIf(process.platform !== 'win32')('SafeFileSystem', () => {
  it('writes a temporary file and renames it to the target', async () => {
    const fs = new FakeFileSystem();
    const safeFs = makeSafeFileSystem(fs, async () => {});
    const target = 'C:\\data\\config.json';

    await safeFs.writeFileAtomic(target, 'hello');

    const temporary = fs.writes[0]?.path ?? '';
    expect(temporary).not.toBe(target);
    expect(temporary.endsWith('.tmp')).toBe(true);
    expect(fs.writes[0]?.data).toBe('hello');
    expect(fs.renames).toEqual([{ from: temporary, to: target }]);
  });

  it('retries an atomic rename on EBUSY', async () => {
    const fs = new FakeFileSystem();
    fs.failRenames(2, 'EBUSY');
    const sleeps: number[] = [];
    const safeFs = makeSafeFileSystem(fs, async (milliseconds) => {
      sleeps.push(milliseconds);
    });

    await safeFs.writeFileAtomic('C:\\data\\config.json', 'hello');

    expect(sleeps).toEqual([10, 20]);
    expect(fs.renames).toHaveLength(1);
  });

  it('retries a write on EPERM', async () => {
    const fs = new FakeFileSystem();
    fs.failWrites(1, 'EPERM');
    const sleeps: number[] = [];
    const safeFs = makeSafeFileSystem(fs, async (milliseconds) => {
      sleeps.push(milliseconds);
    });

    await safeFs.writeFileAtomic('C:\\data\\config.json', 'hello');

    expect(sleeps).toEqual([10]);
    expect(fs.writes).toHaveLength(1);
  });

  it('gives a FileError after the last try and removes the temporary file', async () => {
    const fs = new FakeFileSystem();
    fs.failWrites(10, 'EBUSY');
    const sleeps: number[] = [];
    const safeFs = makeSafeFileSystem(
      fs,
      async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      2,
    );

    await expect(safeFs.writeFileAtomic('C:\\data\\config.json', 'hello')).rejects.toBeInstanceOf(
      FileError,
    );

    expect(sleeps).toEqual([10]);
    expect(fs.unlinks).toHaveLength(1);
  });

  it('does not retry a different error', async () => {
    const fs = new FakeFileSystem();
    fs.failWrites(1, 'ENOENT');
    const sleeps: number[] = [];
    const safeFs = makeSafeFileSystem(fs, async (milliseconds) => {
      sleeps.push(milliseconds);
    });

    await expect(safeFs.writeFileAtomic('C:\\data\\config.json', 'hello')).rejects.toBeInstanceOf(
      FileError,
    );

    expect(sleeps).toHaveLength(0);
  });

  it('reads a file', async () => {
    const fs = new FakeFileSystem();
    const safeFs = makeSafeFileSystem(fs, async () => {});

    const data = await safeFs.readFile('C:\\data\\file.txt');

    expect(data.toString()).toBe('data');
  });

  it('does not fail when a deleted file is missing', async () => {
    const fs = new FakeFileSystem();
    fs.failUnlinks('ENOENT');
    const safeFs = makeSafeFileSystem(fs, async () => {});

    await expect(safeFs.deleteFile('C:\\data\\missing.txt')).resolves.toBeUndefined();
  });
});

describe.skipIf(process.platform !== 'win32')('toLongPath', () => {
  it('adds the prefix to a long local path', () => {
    const longPath = `C:\\${'a'.repeat(300)}\\file.txt`;

    const result = toLongPath(longPath, 'win32');

    expect(result.startsWith('\\\\?\\C:\\')).toBe(true);
    expect(result.endsWith('file.txt')).toBe(true);
  });

  it('adds the UNC prefix to a long share path', () => {
    const longPath = `\\\\server\\share\\${'a'.repeat(300)}\\file.txt`;

    const result = toLongPath(longPath, 'win32');

    expect(result.startsWith('\\\\?\\UNC\\server\\share\\')).toBe(true);
  });

  it('keeps a short path unchanged', () => {
    const filePath = 'C:\\data\\file.txt';

    expect(toLongPath(filePath, 'win32')).toBe(filePath);
  });

  it('keeps an already prefixed path unchanged', () => {
    const filePath = '\\\\?\\C:\\data\\file.txt';

    expect(toLongPath(filePath, 'win32')).toBe(filePath);
  });

  it('keeps a path unchanged on another platform', () => {
    const filePath = `/tmp/${'a'.repeat(300)}/file.txt`;

    expect(toLongPath(filePath, 'linux')).toBe(filePath);
  });
});
