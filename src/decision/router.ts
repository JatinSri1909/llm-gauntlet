import type { Account, AccountManager } from '../accounts/account-manager.js';
import type { DifficultyClass } from '../core/config-schema.js';
import { AppError } from '../core/errors.js';
import type { UsageTracker } from '../usage/usage-tracker.js';

import { pickModel, type ModelConfig } from './model-map.js';

/** The part of the adapter registry that the router needs. */
export interface ModelSource {
  has(provider: string): boolean;
  get(provider: string): { readonly models: readonly string[] };
}

/** The options of the router. */
export interface RouterOptions {
  readonly accounts: AccountManager;
  readonly usage: UsageTracker;
  readonly registry: ModelSource;
  /** The model of each class for each provider, from the config file. */
  readonly models: ModelConfig;
}

/** One account and one model for a task. */
export interface RouteChoice {
  readonly account: Account;
  readonly model: string;
}

interface RankedAccount {
  readonly account: Account;
  readonly tokens: number;
}

/** Pick one account and one model for each task. */
export class Router {
  private readonly options: RouterOptions;

  constructor(options: RouterOptions) {
    this.options = options;
  }

  /**
   * Pick the account and the model for a task of the given class. An account that is not
   * ready, has no adapter, or is in the excluded set is skipped. Among the ready accounts, the
   * one with the fewest tokens in the window is picked. Call again with the failed account in
   * `excludedAccountIds` to pick the next account.
   */
  route(
    difficulty: DifficultyClass,
    excludedAccountIds: ReadonlySet<number> = new Set(),
  ): RouteChoice {
    const ranked = this.rankReadyAccounts(excludedAccountIds);
    const first = ranked[0];
    if (first === undefined) {
      throw new AppError('NO_ACCOUNT_READY', `No account is ready for a ${difficulty} task.`, {
        hint: 'Sign in with "gauntlet login", or wait until a cooling down account is ready. Run "gauntlet accounts" to see the states.',
      });
    }

    const { account } = first;
    const adapter = this.options.registry.get(account.provider);
    const model = pickModel(account.provider, difficulty, adapter.models, this.options.models);

    return { account, model };
  }

  private rankReadyAccounts(excludedAccountIds: ReadonlySet<number>): RankedAccount[] {
    const ranked: RankedAccount[] = [];

    for (const account of this.options.accounts.list()) {
      if (
        excludedAccountIds.has(account.id) ||
        !this.options.registry.has(account.provider) ||
        !this.options.usage.isReady(account.id)
      ) {
        continue;
      }

      ranked.push({ account, tokens: this.options.usage.totals(account.id).tokens });
    }

    // Array.prototype.sort is stable, so accounts with equal usage keep the list order.
    return ranked.sort((left, right) => left.tokens - right.tokens);
  }
}
