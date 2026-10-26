import { homedir } from 'node:os';
import path from 'node:path';

import { FileError } from '../../core/errors.js';
import type { DataPaths } from '../types.js';

/** Options for the Windows data paths. Tests inject the environment. */
export interface WindowsDataPathsOptions {
  /** The environment. The default is `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** The home folder. The default is `os.homedir`. */
  readonly homedir?: () => string;
}

/** Build the data folder paths for Windows. */
export function createWindowsDataPaths(options: WindowsDataPathsOptions = {}): DataPaths {
  const env = options.env ?? process.env;
  const homeFolder = options.homedir ?? homedir;
  const localAppData = env.LOCALAPPDATA;

  const dataFolder =
    localAppData !== undefined && localAppData !== ''
      ? path.join(localAppData, 'llm-gauntlet')
      : path.join(homeFolder(), 'AppData', 'Local', 'llm-gauntlet');

  const sessionsFolder = path.join(dataFolder, 'sessions');
  const keysFolder = path.join(dataFolder, 'keys');
  const logsFolder = path.join(dataFolder, 'logs');

  return {
    dataFolder,
    configFile: path.join(dataFolder, 'config.json'),
    databaseFile: path.join(dataFolder, 'gauntlet.db'),
    sessionsFolder,
    keysFolder,
    logsFolder,
    keyFile: path.join(keysFolder, 'key.bin'),
    sessionFile: (accountId) => path.join(sessionsFolder, `${safeFilePart(String(accountId))}.enc`),
    logFile: (name) => path.join(logsFolder, `${safeFilePart(name)}.log`),
  };
}

function safeFilePart(value: string): string {
  if (
    value === '' ||
    value === '.' ||
    value === '..' ||
    /[\\/:*?"<>|]/.test(value) ||
    /[. ]$/.test(value) ||
    hasControlCharacter(value)
  ) {
    throw new FileError(`The file name is not valid: ${value}`, {
      hint: 'Use only letters, digits, dots, dashes, and underscores.',
    });
  }

  return value;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}
