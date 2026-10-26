import { PlannedError, PlatformError } from '../core/errors.js';

import type { Platform } from './types.js';

export { KEY_LENGTH_BYTES } from './types.js';
export type {
  DataPaths,
  KeyStore,
  Platform,
  ShellResult,
  ShellRunner,
  ShellRunOptions,
} from './types.js';

const PLANNED_PLATFORM_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'The Windows platform code',
};

/** Build the platform code for this operating system. */
export function createPlatform(platform: NodeJS.Platform = process.platform): Platform {
  const plannedName = PLANNED_PLATFORM_NAMES[platform];
  if (plannedName !== undefined) {
    throw new PlannedError(plannedName);
  }

  throw new PlatformError(`The platform is not supported: ${platform}`);
}
