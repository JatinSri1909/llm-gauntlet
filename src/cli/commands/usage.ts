import { Command } from 'commander';

import { loadConfig } from '../../core/config.js';
import { createPlatform } from '../../platform/index.js';
import { UsageTracker } from '../../usage/usage-tracker.js';

import { withServices } from './services.js';
import { STATE_TEXT } from '../../accounts/state-text.js';

/** The parts that a test can replace. */
export interface UsageCommandDeps {
  /** Return the length of the rolling window in hours. The default reads the config file. */
  readonly windowHours?: () => Promise<number>;
}

/** Make the usage command. It shows the requests and tokens of each account. */
export function createUsageCommand(deps: UsageCommandDeps = {}): Command {
  return new Command('usage')
    .description('Show the requests and tokens of each account in the rolling window.')
    .action(async () => {
      await withServices(async (services) => {
        const windowHours = await (deps.windowHours ?? readWindowHours)();
        const tracker = new UsageTracker({
          database: services.database,
          accounts: services.accounts,
          windowHours,
        });
        const summaries = tracker.summaries();

        if (summaries.length === 0) {
          console.log('No accounts. Run "gauntlet login <provider>" to add one.');
          return;
        }

        for (const summary of summaries) {
          const { account, totals, state } = summary;
          const cooling =
            account.coolingUntil === undefined || state !== 'cooling_down'
              ? ''
              : ` until ${account.coolingUntil.toISOString()}`;
          console.log(
            `${account.provider} ${account.label} [${STATE_TEXT[state]}]${cooling}: ` +
              `${String(totals.requests)} requests, ${String(totals.tokens)} tokens ` +
              `in the last ${String(windowHours)} hours`,
          );
        }
      });
    });
}

/** Read the usage window from the config file. */
async function readWindowHours(): Promise<number> {
  const config = await loadConfig(createPlatform().dataPaths.configFile);
  return config.usage.windowHours;
}
