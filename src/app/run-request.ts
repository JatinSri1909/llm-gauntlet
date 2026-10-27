import type { Account, AccountManager } from '../accounts/account-manager.js';
import type { BrowserLauncher, BrowserStorageState } from '../browser/types.js';
import type { Config } from '../core/config.js';
import type { DifficultyClass } from '../core/config-schema.js';
import { AppError } from '../core/errors.js';
import { ContextStore } from '../context/context-store.js';
import { SqliteRequestPacer, type RequestPacer, type WaitReason } from './request-pacer.js';
import {
  ContextSelector,
  estimateTokens,
  type ContextBudget,
} from '../context/context-selector.js';
import { answerWithEscalation } from '../decision/escalation.js';
import { classifyTask, type ClassifyResult, type SecretReader } from '../decision/classifier.js';
import type { QualityProblem } from '../decision/quality-check.js';
import { Router } from '../decision/router.js';
import type { ProviderAdapter, ProviderResult } from '../providers/types.js';
import type { AdapterRegistry } from '../providers/registry.js';
import { SecretStore } from '../security/secret-store.js';
import type { SessionVault } from '../security/session-vault.js';
import { UsageTracker } from '../usage/usage-tracker.js';

import type { Services } from './services.js';

/** An account that was skipped during a request, and why. */
export interface SkippedAccount {
  readonly provider: string;
  readonly label: string;
  /** A short reason. It never holds a secret. */
  readonly reason: string;
}

/** The inputs of one request. */
export interface RunRequestOptions {
  readonly text: string;
  readonly config: Config;
  readonly accounts: AccountManager;
  readonly vault: SessionVault;
  readonly registry: AdapterRegistry;
  readonly store: ContextStore;
  readonly usage: UsageTracker;
  readonly launcher: BrowserLauncher;
  /** The saved API keys. The classifier reads them. */
  readonly secrets: SecretReader;
  /** The fetch function of the classifier API. The tests replace it. */
  readonly fetch?: typeof fetch;
  /** The conversation to add to. A new conversation is made when it is missing. */
  readonly conversationId?: number;
  /**
   * The budget of the context that goes with each request. It is used only with a conversation
   * that already has messages. Without it, the request text goes alone.
   */
  readonly budget?: ContextBudget;
  /** Keeps one request at a time for each account and waits between requests. */
  readonly pacer?: RequestPacer;
}

/** The result of one request. */
export interface RunRequestResult {
  readonly text: string;
  readonly conversationId: number;
  /** The class of the answer. It can be higher than the first class after an escalation. */
  readonly difficulty: DifficultyClass;
  readonly classification: ClassifyResult;
  readonly escalated: boolean;
  readonly account: Account;
  readonly model: string;
  readonly warning?: QualityProblem;
  readonly skipped: readonly SkippedAccount[];
  /** Messages for the user that do not stop the answer, such as a session that could not be saved. */
  readonly notices: readonly string[];
}

interface Attempt {
  readonly text: string;
  readonly account: Account;
  /** The model that the router picked. The escalation compares it. */
  readonly requestedModel: string;
  /** The model that answered. It is the picked model when the page does not say. */
  readonly model: string;
  /** The provider chat that holds the answer. The conversation saves it for later requests. */
  readonly chatUrl?: string;
}

type SendOutcome =
  | {
      readonly kind: 'answer';
      readonly text: string;
      readonly model: string;
      readonly chatUrl?: string;
    }
  | { readonly kind: 'skipped'; readonly reason: string };

/**
 * Run one request. Classify the task, pick the account and the model, send the request in a
 * headless browser, check the answer, and save the records. A limit, a sign-in problem, or an
 * error moves the request to the next account. A CAPTCHA stops the request.
 */
export async function runRequest(options: RunRequestOptions): Promise<RunRequestResult> {
  const { config } = options;

  const classification = await classifyTask({
    prompt: options.text,
    localOnly: config.localOnly,
    provider: config.classifier.provider,
    model: config.classifier.model,
    secrets: options.secrets,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  const router = new Router({
    accounts: options.accounts,
    usage: options.usage,
    registry: options.registry,
    models: config.models,
  });

  const excluded = new Set<number>();
  const skipped: SkippedAccount[] = [];
  const notices: string[] = [];
  const attempts = new Map<DifficultyClass, Attempt>();
  const promptFor = contextPrompter(options);

  // A second call is only worth its quota when it uses another model. The same model on another
  // account gives the same quality, so the first answer stays.
  const differsFromFirst = (difficulty: DifficultyClass): boolean => {
    const first = attempts.get(classification.class);
    if (first === undefined) {
      return true;
    }

    try {
      return router.route(difficulty, excluded).model !== first.requestedModel;
    } catch {
      return false;
    }
  };

  const askAt = async (difficulty: DifficultyClass): Promise<string> => {
    const prompt = promptFor(difficulty);
    for (;;) {
      const choice = router.route(difficulty, excluded);
      const outcome = await sendToAccount(options, choice.account, choice.model, prompt, notices);

      if (outcome.kind === 'answer') {
        attempts.set(difficulty, {
          text: outcome.text,
          account: choice.account,
          requestedModel: choice.model,
          model: outcome.model,
          ...(outcome.chatUrl === undefined ? {} : { chatUrl: outcome.chatUrl }),
        });
        return outcome.text;
      }

      excluded.add(choice.account.id);
      skipped.push({
        provider: choice.account.provider,
        label: choice.account.label,
        reason: outcome.reason,
      });
    }
  };

  const answer = await answerWithEscalation(classification.class, askAt, {
    canEscalate: differsFromFirst,
  });
  if (answer.notice !== undefined) {
    notices.push(answer.notice);
  }
  const chosen = attempts.get(answer.difficulty);
  if (chosen === undefined) {
    throw new AppError('ANSWER_MISSING', 'The answer was not recorded.', {
      hint: 'Run the request again.',
    });
  }

  const conversationId =
    options.conversationId ?? options.store.createConversation(titleFor(options.text)).id;
  if (chosen.chatUrl !== undefined) {
    options.store.saveChatLink(chosen.account.id, conversationId, chosen.chatUrl);
  }
  options.store.addMessage({ conversationId, role: 'user', content: options.text });
  if (answer.text.trim() !== '') {
    options.store.addMessage({
      conversationId,
      role: 'assistant',
      content: answer.text,
      accountId: chosen.account.id,
      class: answer.difficulty,
    });
  }

  return {
    text: answer.text,
    conversationId,
    difficulty: answer.difficulty,
    classification,
    escalated: answer.escalated,
    account: chosen.account,
    model: chosen.model,
    ...(answer.warning === undefined ? {} : { warning: answer.warning }),
    skipped,
    notices,
  };
}

/** The longest conversation title. A title is the first line of the first request. */
const TITLE_CHARS = 60;

/** Return the title of a new conversation. It is the first line of the request, cut to a short length. */
function titleFor(text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? '';
  return firstLine.length > TITLE_CHARS ? `${firstLine.slice(0, TITLE_CHARS - 3)}...` : firstLine;
}

/**
 * Return the text to send for a class. With a conversation that has messages and a budget, the
 * text carries the selected context. Otherwise it is the request text alone.
 */
function contextPrompter(options: RunRequestOptions): (difficulty: DifficultyClass) => string {
  if (options.budget === undefined || options.conversationId === undefined) {
    return () => options.text;
  }

  const selector = new ContextSelector({ store: options.store, budget: options.budget });
  const conversationId = options.conversationId;
  return (difficulty) =>
    selector.select({ conversationId, task: options.text, class: difficulty }).text;
}

/** Send one request to one account. It records the usage or the reason for a skip. */
async function sendToAccount(
  options: RunRequestOptions,
  account: Account,
  model: string,
  text: string,
  notices: string[],
): Promise<SendOutcome> {
  const adapter = options.registry.get(account.provider);

  if (!(await options.vault.hasSession(account.id))) {
    options.accounts.setState(account.id, 'needs_login');
    return { kind: 'skipped', reason: 'needs login' };
  }

  let storageState: BrowserStorageState;
  try {
    const saved = await options.vault.load(account.id);
    if (!isStorageState(saved)) {
      return { kind: 'skipped', reason: 'the saved session is not usable' };
    }
    storageState = saved;
  } catch (error) {
    return { kind: 'skipped', reason: errorReason(error) };
  }

  // A conversation that has a saved chat continues that chat. The chat already holds the earlier
  // messages, so the request goes alone.
  const chatUrl =
    options.conversationId === undefined
      ? undefined
      : options.store.chatLink(account.id, options.conversationId);
  const payload = chatUrl === undefined ? text : options.text;
  const attempt = (): Promise<ProviderResult | { readonly error: unknown }> =>
    runInBrowser(options, adapter, account, storageState, payload, model, notices, chatUrl);
  const outcome =
    options.pacer === undefined ? await attempt() : await options.pacer.run(account.id, attempt);

  if ('error' in outcome) {
    return { kind: 'skipped', reason: errorReason(outcome.error) };
  }
  const result = outcome;

  switch (result.kind) {
    case 'answer': {
      const usedModel = result.model ?? model;
      options.usage.recordRequest(
        account.id,
        usedModel,
        estimateTokens(text) + estimateTokens(result.text),
      );
      return {
        kind: 'answer',
        text: result.text,
        model: usedModel,
        ...(result.chatUrl === undefined ? {} : { chatUrl: result.chatUrl }),
      };
    }
    case 'limitReached':
      options.usage.recordLimit(account.id, result.resetAt);
      return { kind: 'skipped', reason: 'limit reached' };
    case 'sessionExpired':
      options.accounts.setState(account.id, 'needs_login');
      return { kind: 'skipped', reason: 'sign-in expired' };
    case 'captchaRequired':
      throw new AppError(
        'CAPTCHA_REQUIRED',
        'A CAPTCHA stopped the request. Solve it in the visible browser window.',
        { hint: 'Run "gauntlet login <provider>" to open the visible window, then ask again.' },
      );
  }
}

/**
 * Open one browser, send the request, save the refreshed session state, and close the browser.
 * A failure comes back as an error value, so the pacer always releases the account.
 */
async function runInBrowser(
  options: RunRequestOptions,
  adapter: ProviderAdapter,
  account: Account,
  storageState: BrowserStorageState,
  text: string,
  model: string,
  notices: string[],
  chatUrl: string | undefined,
): Promise<ProviderResult | { readonly error: unknown }> {
  const session = await options.launcher.launch({ purpose: 'request', storageState });
  try {
    const result = await adapter.send(session.page, {
      text,
      model,
      ...(chatUrl === undefined ? {} : { chatUrl }),
    });
    // Only a page that still shows a signed-in account has a session worth saving.
    if (result.kind === 'answer' || result.kind === 'limitReached') {
      await saveSession(options, account, session.storageState, notices);
    }
    return result;
  } catch (error) {
    return { error };
  } finally {
    await session.close();
  }
}

/** Save the session state after a request. The cookies that the site refreshed would be lost otherwise. */
async function saveSession(
  options: RunRequestOptions,
  account: Account,
  readState: () => Promise<unknown>,
  notices: string[],
): Promise<void> {
  try {
    await options.vault.save(account.id, await readState());
  } catch {
    notices.push(
      `The session of ${account.provider} ${account.label} could not be saved. Sign in again if the next request fails.`,
    );
  }
}

/** Check that a saved value has the shape of a browser storage state. */
function isStorageState(value: unknown): value is BrowserStorageState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'cookies' in value &&
    Array.isArray(value.cookies) &&
    'origins' in value &&
    Array.isArray(value.origins)
  );
}

/** Return the reason for a skip. A typed error gives its message, which never holds a secret. */
function errorReason(error: unknown): string {
  return error instanceof AppError ? error.message : 'an unexpected error stopped the request';
}

/** The parts of a request that the commands share. The text and the conversation come later. */
export function sharedRequestOptions(
  services: Services,
  config: Config,
  launcher: BrowserLauncher,
  onWait?: (reason: WaitReason, waitMs: number) => void,
): Omit<RunRequestOptions, 'text' | 'conversationId'> {
  return {
    config,
    accounts: services.accounts,
    vault: services.vault,
    registry: services.registry,
    store: new ContextStore(services.database),
    usage: new UsageTracker({
      database: services.database,
      accounts: services.accounts,
      windowHours: config.usage.windowHours,
    }),
    launcher,
    secrets: new SecretStore(services.vault),
    budget: config.context,
    pacer: new SqliteRequestPacer({
      database: services.database,
      minDelayMs: config.requests.minDelaySeconds * 1000,
      ...(onWait === undefined ? {} : { onWait }),
    }),
  };
}
