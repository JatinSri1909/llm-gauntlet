import type { Account, AccountManager } from '../accounts/account-manager.js';
import type { BrowserLauncher, BrowserStorageState } from '../browser/types.js';
import type { Config } from '../core/config.js';
import type { DifficultyClass } from '../core/config-schema.js';
import { AppError } from '../core/errors.js';
import type { ContextStore } from '../context/context-store.js';
import { estimateTokens } from '../context/context-selector.js';
import { answerWithEscalation } from '../decision/escalation.js';
import { classifyTask, type ClassifyResult, type SecretReader } from '../decision/classifier.js';
import type { QualityProblem } from '../decision/quality-check.js';
import { Router } from '../decision/router.js';
import type { ProviderResult } from '../providers/types.js';
import type { AdapterRegistry } from '../providers/registry.js';
import type { SessionVault } from '../security/session-vault.js';
import type { UsageTracker } from '../usage/usage-tracker.js';

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
}

interface Attempt {
  readonly text: string;
  readonly account: Account;
  readonly model: string;
}

type SendOutcome =
  | { readonly kind: 'answer'; readonly text: string }
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
  const attempts = new Map<DifficultyClass, Attempt>();

  const askAt = async (difficulty: DifficultyClass): Promise<string> => {
    for (;;) {
      const choice = router.route(difficulty, excluded);
      const outcome = await sendToAccount(options, choice.account, choice.model, options.text);

      if (outcome.kind === 'answer') {
        attempts.set(difficulty, {
          text: outcome.text,
          account: choice.account,
          model: choice.model,
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

  const answer = await answerWithEscalation(classification.class, askAt);
  const chosen = attempts.get(answer.difficulty);
  if (chosen === undefined) {
    throw new AppError('ANSWER_MISSING', 'The answer was not recorded.', {
      hint: 'Run the request again.',
    });
  }

  const conversationId = options.conversationId ?? options.store.createConversation().id;
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
  };
}

/** Send one request to one account. It records the usage or the reason for a skip. */
async function sendToAccount(
  options: RunRequestOptions,
  account: Account,
  model: string,
  text: string,
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

  const session = await options.launcher.launch({ purpose: 'request', storageState });
  let result: ProviderResult;
  try {
    result = await adapter.send(session.page, { text, model });
  } catch (error) {
    return { kind: 'skipped', reason: errorReason(error) };
  } finally {
    await session.close();
  }

  switch (result.kind) {
    case 'answer':
      options.usage.recordRequest(
        account.id,
        model,
        estimateTokens(text) + estimateTokens(result.text),
      );
      return { kind: 'answer', text: result.text };
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

/** Return a short reason for an error. A typed error gives its code. */
function errorReason(error: unknown): string {
  return error instanceof AppError ? error.code : 'error';
}
