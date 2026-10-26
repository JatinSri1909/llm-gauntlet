import { AppError } from '../core/errors.js';

import type { SessionVault } from './session-vault.js';

const NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const SECRET_PREFIX = 'secret-';

/** The value that the secret store encrypts. */
interface SecretRecord {
  readonly value: string;
}

/** Save, load, and delete secrets such as API keys. The values are encrypted on disk. */
export class SecretStore {
  private readonly vault: SessionVault;

  constructor(vault: SessionVault) {
    this.vault = vault;
  }

  /** Encrypt a secret and save it under a name. The name is lowercase, like `groq-key`. */
  async save(name: string, value: string): Promise<void> {
    const fileId = toFileId(name);
    if (value === '') {
      throw new AppError('SECRET_INVALID', 'The secret is empty.', {
        hint: 'Enter the key that the provider gave you.',
      });
    }

    const record: SecretRecord = { value };
    await this.vault.save(fileId, record);
  }

  /** Load a secret by name. It returns undefined when no secret has that name. */
  async load(name: string): Promise<string | undefined> {
    const fileId = toFileId(name);
    if (!(await this.vault.hasSession(fileId))) {
      return undefined;
    }

    const record = await this.vault.load(fileId);
    return isSecretRecord(record) ? record.value : undefined;
  }

  /** Delete a secret by name. A missing secret is not an error. */
  async delete(name: string): Promise<void> {
    await this.vault.delete(toFileId(name));
  }
}

function toFileId(name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new AppError('SECRET_INVALID', `The secret name is not valid: ${name}`, {
      hint: 'Use lowercase letters, digits, and dashes. Start with a letter. Example: groq-key.',
    });
  }

  return `${SECRET_PREFIX}${name}`;
}

function isSecretRecord(value: unknown): value is SecretRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.value === 'string'
  );
}
