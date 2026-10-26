import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SecurityError } from '../core/errors.js';
import { KEY_LENGTH_BYTES, type DataPaths, type KeyStore } from '../platform/types.js';

/** Read, write, and delete the encrypted session files. */
export interface SessionFileStore {
  /** Read a file. */
  read(filePath: string): Promise<Buffer>;
  /** Write a file. */
  write(filePath: string, data: Buffer): Promise<void>;
  /** Delete a file. A missing file is not an error. */
  delete(filePath: string): Promise<void>;
  /** Return true when the file exists. */
  exists(filePath: string): Promise<boolean>;
}

/** Options for the session vault. */
export interface SessionVaultOptions {
  /** The data folder paths. */
  readonly dataPaths: DataPaths;
  /** The key store that holds the encryption key. */
  readonly keyStore: KeyStore;
  /** The file store. The default reads and writes the real files. */
  readonly fileStore?: SessionFileStore;
}

const MAGIC = Buffer.from('LGSV', 'ascii');
const VERSION = 1;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1;

/** Encrypt and decrypt the session state of each account. */
export class SessionVault {
  private readonly dataPaths: DataPaths;
  private readonly keyStore: KeyStore;
  private readonly fileStore: SessionFileStore;

  constructor(options: SessionVaultOptions) {
    this.dataPaths = options.dataPaths;
    this.keyStore = options.keyStore;
    this.fileStore = options.fileStore ?? createNodeSessionFileStore();
  }

  /** Return true when an account has a saved session file. */
  async hasSession(accountId: string | number): Promise<boolean> {
    return this.fileStore.exists(this.dataPaths.sessionFile(accountId));
  }

  /** Encrypt the session state and save it in the file of the account. */
  async save(accountId: string | number, state: unknown): Promise<void> {
    const plainText = Buffer.from(JSON.stringify(state), 'utf8');
    const key = await this.readKey();
    const nonce = randomBytes(NONCE_LENGTH);

    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LENGTH });
    cipher.setAAD(
      Buffer.from(`${MAGIC.toString('ascii')}:${VERSION}:${String(accountId)}`, 'utf8'),
    );

    const cipherText = Buffer.concat([cipher.update(plainText), cipher.final()]);
    const tag = cipher.getAuthTag();

    const fileContent = Buffer.concat([MAGIC, Buffer.from([VERSION]), nonce, tag, cipherText]);

    await this.fileStore.write(this.dataPaths.sessionFile(accountId), fileContent);
  }

  /** Read and decrypt the session state of an account. */
  async load(accountId: string | number): Promise<unknown> {
    const filePath = this.dataPaths.sessionFile(accountId);

    let fileContent: Buffer;
    try {
      fileContent = await this.fileStore.read(filePath);
    } catch (error) {
      throw new SecurityError(`No session state for the account: ${String(accountId)}`, {
        hint: 'Run "gauntlet login <provider>" to sign in again.',
        cause: error,
      });
    }

    if (fileContent.length < HEADER_LENGTH + NONCE_LENGTH + TAG_LENGTH) {
      throw new SecurityError('The session file is too short.', {
        hint: 'Run "gauntlet login <provider>" to sign in again.',
      });
    }

    const magic = fileContent.subarray(0, MAGIC.length);
    if (!timingSafeEqual(magic, MAGIC)) {
      throw new SecurityError('The session file has an unknown format.', {
        hint: 'Run "gauntlet login <provider>" to sign in again.',
      });
    }

    const version = fileContent[MAGIC.length];
    if (version !== VERSION) {
      throw new SecurityError(`The session file version is not supported: ${version ?? 0}`, {
        hint: 'Update llm-gauntlet and sign in again.',
      });
    }

    const nonceStart = HEADER_LENGTH;
    const tagStart = nonceStart + NONCE_LENGTH;
    const cipherTextStart = tagStart + TAG_LENGTH;

    const nonce = fileContent.subarray(nonceStart, tagStart);
    const tag = fileContent.subarray(tagStart, cipherTextStart);
    const cipherText = fileContent.subarray(cipherTextStart);

    const key = await this.readKey();
    let plainText: Buffer;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
        authTagLength: TAG_LENGTH,
      });
      decipher.setAAD(
        Buffer.from(`${MAGIC.toString('ascii')}:${VERSION}:${String(accountId)}`, 'utf8'),
      );
      decipher.setAuthTag(tag);
      plainText = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    } catch (error) {
      throw new SecurityError('The session file cannot be decrypted.', {
        hint: 'The file is damaged or the key changed. Sign in again.',
        cause: error,
      });
    }

    try {
      return JSON.parse(plainText.toString('utf8'));
    } catch (error) {
      throw new SecurityError('The session state is not valid JSON.', {
        hint: 'Sign in again.',
        cause: error,
      });
    }
  }

  /** Delete the session file of an account. */
  async delete(accountId: string | number): Promise<void> {
    await this.fileStore.delete(this.dataPaths.sessionFile(accountId));
  }

  private async readKey(): Promise<Buffer> {
    const key = await this.keyStore.getKey();
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new SecurityError(`The key must be ${KEY_LENGTH_BYTES} bytes.`);
    }

    return key;
  }
}

/** The file store that reads and writes the real files. */
export function createNodeSessionFileStore(): SessionFileStore {
  return {
    read: (filePath) => readFile(filePath),
    write: async (filePath, data) => {
      const folder = path.dirname(filePath);
      await mkdir(folder, { recursive: true });
      const temporary = path.join(
        folder,
        `.${path.basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`,
      );

      try {
        await writeFile(temporary, data);
        await rename(temporary, filePath);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    },
    delete: async (filePath) => {
      await rm(filePath, { force: true });
    },
    exists: async (filePath) => {
      try {
        await readFile(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}
