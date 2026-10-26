/** Options for a typed application error. */
export interface AppErrorOptions {
  /** A short hint for the user. */
  readonly hint?: string;
  /** The original error or value that caused this error. */
  readonly cause?: unknown;
}

/** Base class for errors that the application throws on purpose. */
export class AppError extends Error {
  /** A short stable code. */
  readonly code: string;

  /** A short hint for the user, when one exists. */
  readonly hint: string | undefined;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.hint = options.hint;
  }
}

/** A problem in the config file or in a config value. */
export class ConfigError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('CONFIG_ERROR', message, options);
  }
}

/** A problem in the platform layer. */
export class PlatformError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('PLATFORM_ERROR', message, options);
  }
}

/** A feature that this version does not have yet. */
export class PlannedError extends AppError {
  constructor(feature: string) {
    super('PLANNED', `${feature} is Planned.`, {
      hint: 'This feature is not available in this version.',
    });
  }
}

/** A problem with a file or a folder. */
export class FileError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('FILE_ERROR', message, options);
  }
}

/** A problem in the local store. */
export class StoreError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('STORE_ERROR', message, options);
  }
}

/** A problem with a secret, a key, or a session. */
export class SecurityError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('SECURITY_ERROR', message, options);
  }
}

/** A problem in a provider adapter or in a provider page. */
export class ProviderError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('PROVIDER_ERROR', message, options);
  }
}
