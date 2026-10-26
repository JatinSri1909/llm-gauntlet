import type { Command } from 'commander';

import { createPlannedCommand } from './planned.js';

/** Make the doctor command stub. */
export function createDoctorCommand(): Command {
  return createPlannedCommand(
    'doctor',
    'Check Node.js, the browser, the data folder, and the key store.',
  );
}
