/** The length of the encryption key in bytes. */
export const KEY_LENGTH_BYTES = 32;

/** Store and read the encryption key. The key never goes in an argument or a log. */
export interface KeyStore {
  /** Return true when a key is stored. */
  hasKey(): Promise<boolean>;
  /** Return the key. Make and store a key on the first call. */
  getKey(): Promise<Buffer>;
  /** Replace the stored key. */
  setKey(key: Buffer): Promise<void>;
  /** Delete the stored key. */
  deleteKey(): Promise<void>;
}

/** Return the data folder and the paths of the files in it. */
export interface DataPaths {
  /** The data folder of the application. */
  readonly dataFolder: string;
  /** The config file. */
  readonly configFile: string;
  /** The local store database. */
  readonly databaseFile: string;
  /** The folder of the encrypted session files. */
  readonly sessionsFolder: string;
  /** The folder of the wrapped key. */
  readonly keysFolder: string;
  /** The folder of the log files. */
  readonly logsFolder: string;
  /** The file of the wrapped key. */
  readonly keyFile: string;
  /** The encrypted session file of one account. */
  sessionFile(accountId: string): string;
  /** A log file with the given name. */
  logFile(name: string): string;
}

/** Options for a shell command. */
export interface ShellRunOptions {
  /** Text that goes to the standard input of the process. */
  readonly input?: string;
  /** The time limit in milliseconds. */
  readonly timeoutMs?: number;
}

/** The result of a shell command. */
export interface ShellResult {
  /** The standard output. */
  readonly stdout: string;
  /** The standard error. */
  readonly stderr: string;
  /** The exit code. */
  readonly exitCode: number;
}

/** Run a helper program. Pass secrets through stdin, never as an argument. */
export interface ShellRunner {
  run(program: string, args: readonly string[], options?: ShellRunOptions): Promise<ShellResult>;
}

/** The code that this operating system needs. */
export interface Platform {
  readonly keyStore: KeyStore;
  readonly dataPaths: DataPaths;
  readonly shellRunner: ShellRunner;
}
