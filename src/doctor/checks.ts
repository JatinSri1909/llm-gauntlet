import type { KeyStore } from '../platform/types.js';

/** The Node.js major version that the application needs. */
export const REQUIRED_NODE_MAJOR = 24;

/** The result of one check. */
export type CheckStatus = 'pass' | 'fail';

/** One check result. The hint tells the user what to do after a failure. */
export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly message: string;
  readonly hint?: string;
}

/** The facts that the checks read. The tests replace them with fakes. */
export interface DoctorEnvironment {
  /** The Node.js version, such as `24.1.0`. */
  readonly nodeVersion: string;
  /** The data folder of the application. */
  readonly dataFolder: string;
  /** The local store database. */
  readonly databaseFile: string;
  /** The key store. The check only reads whether a key exists. */
  readonly keyStore: Pick<KeyStore, 'hasKey' | 'getKey'>;
  /** Return true when the folder exists or can be made, and a file can be written in it. */
  folderIsWritable(folder: string): Promise<boolean>;
  /** Return the path of a browser that the application can start, or undefined. */
  findBrowser(): Promise<string | undefined>;
  /** Open the database and read from it. It throws when that fails. */
  checkDatabase(databaseFile: string): Promise<void>;
}

/** Check the Node.js version. */
export function checkNodeVersion(env: DoctorEnvironment): CheckResult {
  const major = Number(env.nodeVersion.split('.')[0]);

  if (major >= REQUIRED_NODE_MAJOR) {
    return { name: 'Node.js', status: 'pass', message: `version ${env.nodeVersion}` };
  }

  return {
    name: 'Node.js',
    status: 'fail',
    message: `version ${env.nodeVersion} is too old`,
    hint: `Install Node.js ${String(REQUIRED_NODE_MAJOR)} or newer.`,
  };
}

/** Check that a browser can be started. */
export async function checkBrowser(env: DoctorEnvironment): Promise<CheckResult> {
  const browser = await env.findBrowser();

  if (browser !== undefined) {
    return { name: 'Browser', status: 'pass', message: `found ${browser}` };
  }

  return {
    name: 'Browser',
    status: 'fail',
    message: 'no browser was found',
    hint: 'Install Microsoft Edge, or run "npx playwright install chromium".',
  };
}

/** Check that the data folder can be written. */
export async function checkDataFolder(env: DoctorEnvironment): Promise<CheckResult> {
  if (await env.folderIsWritable(env.dataFolder)) {
    return { name: 'Data folder', status: 'pass', message: `${env.dataFolder} is writable` };
  }

  return {
    name: 'Data folder',
    status: 'fail',
    message: `${env.dataFolder} cannot be written`,
    hint: 'Check that your user can write to the folder.',
  };
}

/** Check that the key store can be read. A missing key is not a failure. It is made on first use. */
export async function checkKeyStore(env: DoctorEnvironment): Promise<CheckResult> {
  try {
    if (!(await env.keyStore.hasKey())) {
      return {
        name: 'Key store',
        status: 'pass',
        message: 'no key yet, it is made on the first use',
      };
    }
  } catch {
    return keyStoreFailure();
  }

  // A file that exists can still be useless. It may belong to another Windows user or be damaged.
  try {
    await env.keyStore.getKey();
    return { name: 'Key store', status: 'pass', message: 'the saved key unwraps' };
  } catch {
    return keyStoreFailure();
  }
}

/** Check that the database opens and answers a query. */
export async function checkDatabase(env: DoctorEnvironment): Promise<CheckResult> {
  try {
    await env.checkDatabase(env.databaseFile);
    return { name: 'Database', status: 'pass', message: `${env.databaseFile} opens` };
  } catch (error) {
    return {
      name: 'Database',
      status: 'fail',
      message: error instanceof Error ? error.message : 'the database cannot be opened',
      hint: 'Close other programs that use the database, then try again.',
    };
  }
}

/** Run every check in order. */
export async function runChecks(env: DoctorEnvironment): Promise<CheckResult[]> {
  return [
    checkNodeVersion(env),
    await checkBrowser(env),
    await checkDataFolder(env),
    await checkKeyStore(env),
    await checkDatabase(env),
  ];
}

/** Return true when at least one check failed. */
export function hasFailure(results: readonly CheckResult[]): boolean {
  return results.some((result) => result.status === 'fail');
}

/** Format one result as text. A failure adds its hint on the next line. */
export function formatCheck(result: CheckResult): string {
  const label = result.status === 'pass' ? 'PASS' : 'FAIL';
  const line = `${label} ${result.name}: ${result.message}`;

  return result.status === 'fail' && result.hint !== undefined
    ? `${line}\n     ${result.hint}`
    : line;
}

function keyStoreFailure(): CheckResult {
  return {
    name: 'Key store',
    status: 'fail',
    message: 'the saved key cannot be read',
    hint: 'The key file is for another Windows user or is damaged. Delete the file in the keys folder, sign in to each account again, and save the classifier API keys again with "gauntlet key set".',
  };
}
