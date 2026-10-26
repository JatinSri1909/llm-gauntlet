import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SecurityError } from '../../core/errors.js';
import { KEY_LENGTH_BYTES, type DataPaths, type KeyStore } from '../types.js';
import { SafeFileSystem } from './safe-fs.js';
import { findWindowsPowerShell, WindowsShellRunner } from './shell-runner.js';

/** Options for the Windows key store. */
export interface WindowsKeyStoreOptions {
  /** The data folder paths. */
  readonly dataPaths: DataPaths;
  /** The safe file code. The default reads and writes the real files. */
  readonly fileSystem?: SafeFileSystem;
  /** The shell runner. The default runs Windows PowerShell. */
  readonly shellRunner?: WindowsShellRunner;
  /** The path of the DPAPI helper. The default is next to this file. */
  readonly helperPath?: string;
  /** The PowerShell program. The default is the Windows PowerShell 5.1 path. */
  readonly powershellPath?: string;
}

const HELPER_FILE = 'dpapi.ps1';

/** Store the encryption key in a file that DPAPI wraps for the current user. */
export class WindowsKeyStore implements KeyStore {
  private readonly dataPaths: DataPaths;
  private readonly fileSystem: SafeFileSystem;
  private readonly shellRunner: WindowsShellRunner;
  private readonly helperPath: string;
  private readonly powershellPath: string;

  constructor(options: WindowsKeyStoreOptions) {
    this.dataPaths = options.dataPaths;
    this.fileSystem = options.fileSystem ?? new SafeFileSystem();
    this.shellRunner = options.shellRunner ?? new WindowsShellRunner();
    this.helperPath =
      options.helperPath ?? path.join(path.dirname(fileURLToPath(import.meta.url)), HELPER_FILE);
    this.powershellPath = options.powershellPath ?? findWindowsPowerShell();
  }

  async hasKey(): Promise<boolean> {
    try {
      await this.fileSystem.readFile(this.dataPaths.keyFile);
      return true;
    } catch {
      return false;
    }
  }

  async getKey(): Promise<Buffer> {
    if (await this.hasKey()) {
      const wrapped = await this.fileSystem.readFile(this.dataPaths.keyFile);
      return this.unprotect(wrapped);
    }

    const key = randomBytes(KEY_LENGTH_BYTES);
    await this.setKey(key);
    return Buffer.from(key);
  }

  async setKey(key: Buffer): Promise<void> {
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new SecurityError(`The key must be ${KEY_LENGTH_BYTES} bytes.`);
    }

    const wrapped = await this.runHelper('protect', key.toString('base64'));
    await this.fileSystem.writeFileAtomic(this.dataPaths.keyFile, Buffer.from(wrapped, 'utf8'));
  }

  async deleteKey(): Promise<void> {
    await this.fileSystem.deleteFile(this.dataPaths.keyFile);
  }

  private async unprotect(wrapped: Buffer): Promise<Buffer> {
    const plain = await this.runHelper('unprotect', wrapped.toString('utf8').trim());
    const key = Buffer.from(plain, 'base64');

    if (key.length !== KEY_LENGTH_BYTES) {
      throw new SecurityError('The key file is not valid.', {
        hint: 'Run "gauntlet login" again to make a new key. Then sign in to each account.',
      });
    }

    return key;
  }

  private async runHelper(action: 'protect' | 'unprotect', base64Input: string): Promise<string> {
    const result = await this.shellRunner.run(
      this.powershellPath,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.helperPath,
        '-Action',
        action,
      ],
      { input: base64Input, timeoutMs: 20_000 },
    );

    if (result.exitCode !== 0) {
      throw new SecurityError('The DPAPI helper failed.', {
        hint: 'Run "gauntlet doctor" to check the key store.',
        cause: result.stderr.trim(),
      });
    }

    return result.stdout.trim();
  }
}
