import { Command } from 'commander';

import { formatCheck, hasFailure, runChecks, type DoctorEnvironment } from '../../doctor/checks.js';
import { createDoctorEnvironment } from '../../doctor/environment.js';
import { createPlatform } from '../../platform/index.js';

/** The parts that a test can replace. */
export interface DoctorCommandDeps {
  /** Return the environment that the checks read. The default is this machine. */
  readonly environment?: () => DoctorEnvironment;
}

/** Make the doctor command. It runs the self checks and exits with 1 when one fails. */
export function createDoctorCommand(deps: DoctorCommandDeps = {}): Command {
  return new Command('doctor')
    .description('Check Node.js, the browser, the data folder, the key store, and the database.')
    .action(async () => {
      const environment = deps.environment?.() ?? createDoctorEnvironment(createPlatform());
      const results = await runChecks(environment);

      for (const result of results) {
        console.log(formatCheck(result));
      }

      if (hasFailure(results)) {
        process.exitCode = 1;
      }
    });
}
