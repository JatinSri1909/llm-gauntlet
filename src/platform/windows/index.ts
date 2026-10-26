import { createWindowsDataPaths } from './data-paths.js';
import { WindowsKeyStore } from './key-store.js';
import { SafeFileSystem } from './safe-fs.js';
import { WindowsShellRunner } from './shell-runner.js';

import type { Platform } from '../types.js';

/** Build the Windows platform code. */
export function createWindowsPlatform(env: NodeJS.ProcessEnv = process.env): Platform {
  const dataPaths = createWindowsDataPaths({ env });
  const fileSystem = new SafeFileSystem();
  const shellRunner = new WindowsShellRunner({ env });

  return {
    dataPaths,
    shellRunner,
    keyStore: new WindowsKeyStore({ dataPaths, fileSystem, shellRunner }),
  };
}

export { createWindowsDataPaths } from './data-paths.js';
export { WindowsKeyStore } from './key-store.js';
export { SafeFileSystem, toLongPath } from './safe-fs.js';
export { findWindowsPowerShell, WindowsShellRunner } from './shell-runner.js';
