import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileError } from '../src/core/errors.js';
import { createWindowsDataPaths } from '../src/platform/windows/data-paths.js';

describe.skipIf(process.platform !== 'win32')('Windows data paths', () => {
  it('uses LOCALAPPDATA for the data folder', () => {
    const paths = createWindowsDataPaths({
      env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
      homedir: () => 'C:\\Users\\test',
    });

    expect(paths.dataFolder).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'llm-gauntlet'));
    expect(paths.configFile).toBe(path.join(paths.dataFolder, 'config.json'));
    expect(paths.databaseFile).toBe(path.join(paths.dataFolder, 'gauntlet.db'));
    expect(paths.keyFile).toBe(path.join(paths.keysFolder, 'key.bin'));
  });

  it('uses the home folder when LOCALAPPDATA is missing', () => {
    const paths = createWindowsDataPaths({
      env: {},
      homedir: () => 'C:\\Users\\test',
    });

    expect(paths.dataFolder).toBe(path.join('C:\\Users\\test', 'AppData', 'Local', 'llm-gauntlet'));
  });

  it('treats an empty LOCALAPPDATA as missing', () => {
    const paths = createWindowsDataPaths({
      env: { LOCALAPPDATA: '' },
      homedir: () => 'C:\\Users\\test',
    });

    expect(paths.dataFolder).toBe(path.join('C:\\Users\\test', 'AppData', 'Local', 'llm-gauntlet'));
  });

  it('makes the session and log file names', () => {
    const paths = createWindowsDataPaths({ env: { LOCALAPPDATA: 'C:\\Data' } });

    expect(paths.sessionFile('account-1')).toBe(path.join(paths.sessionsFolder, 'account-1.enc'));
    expect(paths.logFile('gauntlet')).toBe(path.join(paths.logsFolder, 'gauntlet.log'));
  });

  it('rejects a name with a path separator', () => {
    const paths = createWindowsDataPaths({ env: { LOCALAPPDATA: 'C:\\Data' } });

    expect(() => paths.sessionFile('..\\evil')).toThrow(FileError);
    expect(() => paths.sessionFile('../evil')).toThrow(FileError);
  });
});
