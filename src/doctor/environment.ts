import { access } from 'node:fs/promises';
import path from 'node:path';

import { SqliteDatabase } from '../store/database.js';
import type { Platform } from '../platform/types.js';
import { edgeCandidatePaths } from '../platform/windows/browser-paths.js';
import { SafeFileSystem } from '../platform/windows/safe-fs.js';

import type { DoctorEnvironment } from './checks.js';

/** The name of the file that the folder check writes and removes. */
const PROBE_FILE = '.doctor-probe';

/** Make the environment that the checks read on this machine. */
export function createDoctorEnvironment(
  platform: Platform,
  env: NodeJS.ProcessEnv = process.env,
): DoctorEnvironment {
  const files = new SafeFileSystem();

  return {
    nodeVersion: process.versions.node,
    dataFolder: platform.dataPaths.dataFolder,
    databaseFile: platform.dataPaths.databaseFile,
    keyStore: platform.keyStore,

    folderIsWritable: async (folder) => {
      try {
        await files.ensureFolder(folder);
        const probe = path.join(folder, PROBE_FILE);
        await files.writeFileAtomic(probe, 'probe');
        await files.deleteFile(probe);
        return true;
      } catch {
        return false;
      }
    },

    findBrowser: async () => {
      for (const candidate of edgeCandidatePaths(env)) {
        if (await exists(candidate)) {
          return candidate;
        }
      }

      return findPatchrightChromium();
    },

    checkDatabase: async (databaseFile) => {
      const database = new SqliteDatabase(databaseFile);
      try {
        database.get('SELECT 1 AS ok');
      } finally {
        database.close();
      }
    },
  };
}

/** Return the Patchright Chromium path when that browser is installed. */
async function findPatchrightChromium(): Promise<string | undefined> {
  const { chromium } = await import('patchright');
  const executable = chromium.executablePath();

  return (await exists(executable)) ? executable : undefined;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
