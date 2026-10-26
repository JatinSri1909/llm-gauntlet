import { randomBytes } from 'node:crypto';
import * as nodeFs from 'node:fs/promises';
import path from 'node:path';

import { FileError } from '../../core/errors.js';

/** The file operations that safe-fs needs. Tests provide a fake. */
export interface FileSystem {
  mkdir(folderPath: string, options: { recursive: true }): Promise<void>;
  readFile(filePath: string): Promise<Buffer>;
  writeFile(filePath: string, data: Uint8Array | string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(filePath: string): Promise<void>;
}

/** Options for the safe file code. Tests inject the dependencies. */
export interface SafeFileSystemOptions {
  /** The file operations. The default is the Node.js file system. */
  readonly fs?: FileSystem;
  /** The wait between retries. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
  /** The platform. The default is `process.platform`. */
  readonly platform?: NodeJS.Platform;
  /** The maximum number of tries for one operation. The default is 5. */
  readonly maxAttempts?: number;
  /** The first retry delay in milliseconds. The default is 50. */
  readonly retryDelayMs?: number;
}

const NODE_FS: FileSystem = {
  mkdir: async (folderPath, options) => {
    await nodeFs.mkdir(folderPath, options);
  },
  readFile: (filePath) => nodeFs.readFile(filePath),
  writeFile: async (filePath, data) => {
    await nodeFs.writeFile(filePath, data);
  },
  rename: (oldPath, newPath) => nodeFs.rename(oldPath, newPath),
  unlink: (filePath) => nodeFs.unlink(filePath),
};

const LONG_PATH_LIMIT = 260;

/** Add the Windows long path prefix to a path that needs it. */
export function toLongPath(filePath: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32' || filePath.startsWith('\\\\?\\')) {
    return filePath;
  }

  const absolute = path.resolve(filePath);
  if (absolute.length < LONG_PATH_LIMIT) {
    return filePath;
  }

  if (absolute.startsWith('\\\\')) {
    return `\\\\?\\UNC\\${absolute.slice(2)}`;
  }

  return `\\\\?\\${absolute}`;
}

/** Read, write, and delete files on Windows with retries for file locks. */
export class SafeFileSystem {
  private readonly fs: FileSystem;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly platform: NodeJS.Platform;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;

  constructor(options: SafeFileSystemOptions = {}) {
    this.fs = options.fs ?? NODE_FS;
    this.sleep = options.sleep ?? delay;
    this.platform = options.platform ?? process.platform;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryDelayMs = options.retryDelayMs ?? 50;
  }

  /** Make a folder and its parents. */
  async ensureFolder(folderPath: string): Promise<void> {
    const target = toLongPath(folderPath, this.platform);
    try {
      await this.retry(() => this.fs.mkdir(target, { recursive: true }));
    } catch (error) {
      throw new FileError(`Cannot make the folder: ${folderPath}`, {
        hint: 'Check that you can write to the parent folder.',
        cause: error,
      });
    }
  }

  /** Read a file. */
  async readFile(filePath: string): Promise<Buffer> {
    const target = toLongPath(filePath, this.platform);
    try {
      return await this.retry(() => this.fs.readFile(target));
    } catch (error) {
      throw new FileError(`Cannot read the file: ${filePath}`, {
        hint: 'Check that the file exists and that you can read it.',
        cause: error,
      });
    }
  }

  /** Write a file through a temporary file and a rename. */
  async writeFileAtomic(filePath: string, data: Uint8Array | string): Promise<void> {
    const target = toLongPath(filePath, this.platform);
    const folder = path.dirname(target);
    const temporary = path.join(
      folder,
      `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`,
    );

    try {
      await this.retry(() => this.fs.mkdir(folder, { recursive: true }));
      await this.retry(() => this.fs.writeFile(temporary, data));
      await this.retry(() => this.fs.rename(temporary, target));
    } catch (error) {
      await this.fs.unlink(temporary).catch(() => undefined);
      throw new FileError(`Cannot write the file: ${filePath}`, {
        hint: 'Close the program that holds the file and try again.',
        cause: error,
      });
    }
  }

  /** Delete a file. A missing file is not an error. */
  async deleteFile(filePath: string): Promise<void> {
    const target = toLongPath(filePath, this.platform);
    try {
      await this.retry(() => this.fs.unlink(target));
    } catch (error) {
      if (isErrno(error, 'ENOENT')) {
        return;
      }

      throw new FileError(`Cannot delete the file: ${filePath}`, {
        hint: 'Close the program that holds the file and try again.',
        cause: error,
      });
    }
  }

  private async retry<T>(action: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await action();
      } catch (error) {
        if (attempt >= this.maxAttempts || !isRetryable(error)) {
          throw error;
        }

        await this.sleep(this.retryDelayMs * attempt);
      }
    }
  }
}

function isRetryable(error: unknown): boolean {
  return isErrno(error, 'EBUSY') || isErrno(error, 'EPERM');
}

function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
