import { randomBytes } from 'node:crypto';

import { SecurityError } from '../../core/errors.js';
import { KEY_LENGTH_BYTES, type KeyStore } from '../types.js';

/** A KeyStore for tests. It keeps the key in memory only. */
export class MemoryKeyStore implements KeyStore {
  private key: Buffer | undefined;

  async hasKey(): Promise<boolean> {
    return this.key !== undefined;
  }

  async getKey(): Promise<Buffer> {
    if (this.key === undefined) {
      this.key = randomBytes(KEY_LENGTH_BYTES);
    }

    return Buffer.from(this.key);
  }

  async setKey(key: Buffer): Promise<void> {
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new SecurityError(`The key must be ${KEY_LENGTH_BYTES} bytes.`);
    }

    this.key = Buffer.from(key);
  }

  async deleteKey(): Promise<void> {
    this.key = undefined;
  }
}
