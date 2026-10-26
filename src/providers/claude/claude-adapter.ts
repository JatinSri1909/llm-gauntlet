import { ProviderError } from '../../core/errors.js';

import type {
  ProviderAdapter,
  ProviderPage,
  ProviderRequest,
  ProviderResult,
  ProviderSignal,
} from '../types.js';

import {
  CLAUDE_CAPTCHA_FRAMES,
  CLAUDE_CAPTCHA_PATTERNS,
  CLAUDE_LIMIT_PATTERNS,
  CLAUDE_SELECTORS,
} from './selectors.js';

/** The options for the Claude adapter. */
export interface ClaudeAdapterOptions {
  /** The base address of the Claude site. The tests use a local server. */
  readonly baseUrl?: string;
  /** The time limit for the answer in milliseconds. A request can set its own limit. */
  readonly answerTimeoutMs?: number;
  /** The time between two answer reads in milliseconds. */
  readonly pollIntervalMs?: number;
  /** The models that the adapter can use, from the cheapest to the most capable. */
  readonly models?: readonly string[];
  /** The clock. The reset time of a limit message uses it. The tests set it. */
  readonly now?: () => Date;
}

const DEFAULT_BASE_URL = 'https://claude.ai';
const DEFAULT_ANSWER_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const COMPOSER_TIMEOUT_MS = 30_000;
const STABLE_READS = 3;
const MAX_MESSAGE_LENGTH = 200;
const MAX_MODEL_LENGTH = 60;

/** The Claude adapter. It sends one request and reads the answer. */
export class ClaudeAdapter implements ProviderAdapter {
  readonly name = 'claude';
  readonly loginUrl: string;
  readonly models: readonly string[];

  private readonly baseUrl: string;
  private readonly answerTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly now: () => Date;

  constructor(options: ClaudeAdapterOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.loginUrl = `${this.baseUrl}/login`;
    this.models = options.models ?? ['sonnet-5.5-medium'];
    this.answerTimeoutMs = options.answerTimeoutMs ?? DEFAULT_ANSWER_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.now = options.now ?? (() => new Date());
  }

  /** Return true when the page shows a signed-in account. */
  async isSignedIn(page: ProviderPage): Promise<boolean> {
    return page.isVisible(CLAUDE_SELECTORS.composer);
  }

  /**
   * Send one request in a new chat and return the answer or a signal.
   * The adapter uses the default model of the account. It does not switch models.
   */
  async send(page: ProviderPage, request: ProviderRequest): Promise<ProviderResult> {
    const timeoutMs = request.timeoutMs ?? this.answerTimeoutMs;

    try {
      await page.goto(`${this.baseUrl}/new`);
    } catch (error) {
      throw new ProviderError('Cannot open the Claude page.', {
        hint: 'Check the network connection and try again.',
        cause: error,
      });
    }

    const early = await this.findSignal(page);
    if (early !== undefined) {
      return early;
    }

    try {
      await page.waitForSelector(
        CLAUDE_SELECTORS.composer,
        Math.min(timeoutMs, COMPOSER_TIMEOUT_MS),
      );
    } catch (error) {
      const signal = await this.findSignal(page);
      if (signal !== undefined) {
        return signal;
      }

      throw missingSelector('composer', CLAUDE_SELECTORS.composer, error);
    }

    const ready = await this.findSignal(page);
    if (ready !== undefined) {
      return ready;
    }

    await this.step('composer', CLAUDE_SELECTORS.composer, () =>
      page.fill(CLAUDE_SELECTORS.composer, request.text),
    );
    await this.step('send button', CLAUDE_SELECTORS.send, () => page.click(CLAUDE_SELECTORS.send));

    const outcome = await this.waitForAnswer(page, request.text, timeoutMs);
    if (typeof outcome !== 'string') {
      return outcome;
    }

    const model = await this.readModel(page);
    return { kind: 'answer', text: outcome, ...(model === undefined ? {} : { model }) };
  }

  /**
   * Read the model name that the page shows. It returns undefined when the page shows none, so
   * the caller keeps the model that it asked for.
   */
  private async readModel(page: ProviderPage): Promise<string | undefined> {
    try {
      const label = ((await page.textOf(CLAUDE_SELECTORS.modelButton)) ?? '')
        .replace(/^\s*model:?/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      return label === '' || label.length > MAX_MODEL_LENGTH ? undefined : label;
    } catch {
      return undefined;
    }
  }

  /** Run one page step. A failure becomes a typed error that names the selector. */
  private async step(what: string, selector: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      throw missingSelector(what, selector, error);
    }
  }

  /**
   * Return the signal that the page shows. It returns undefined for a normal page.
   * The text of the request is removed first, so the request cannot trigger a signal.
   */
  private async findSignal(
    page: ProviderPage,
    requestText?: string,
  ): Promise<ProviderSignal | undefined> {
    if (await this.hasCaptcha(page, requestText)) {
      return { kind: 'captchaRequired' };
    }

    if (await this.hasLoginForm(page)) {
      return { kind: 'sessionExpired' };
    }

    const limit = await this.findLimit(page, requestText);
    if (limit !== undefined) {
      const resetAt = parseResetTime(limit, this.now());
      return {
        kind: 'limitReached',
        message: limit,
        ...(resetAt === undefined ? {} : { resetAt }),
      };
    }

    return undefined;
  }

  /** Return true when the page shows a CAPTCHA or a human check. */
  private async hasCaptcha(page: ProviderPage, requestText?: string): Promise<boolean> {
    if (await page.isVisible(CLAUDE_SELECTORS.captcha)) {
      return true;
    }

    for (const selector of CLAUDE_CAPTCHA_FRAMES) {
      if (await page.isVisible(selector)) {
        return true;
      }
    }

    const text = withoutRequest(await page.bodyText(), requestText);
    return CLAUDE_CAPTCHA_PATTERNS.some((pattern) => pattern.test(text));
  }

  /** Return true when the page shows the sign-in form. */
  private async hasLoginForm(page: ProviderPage): Promise<boolean> {
    return (
      (await page.isVisible(CLAUDE_SELECTORS.loginWithGoogle)) ||
      (await page.isVisible(CLAUDE_SELECTORS.email))
    );
  }

  /** Return the text of a limit message. It returns undefined when there is none. */
  private async findLimit(page: ProviderPage, requestText?: string): Promise<string | undefined> {
    const notice = withoutRequest((await page.textOf(CLAUDE_SELECTORS.notice)) ?? '', requestText);
    if (CLAUDE_LIMIT_PATTERNS.some((pattern) => pattern.test(notice))) {
      return shorten(notice);
    }

    const lines = withoutRequest(await page.bodyText(), requestText)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '');

    const index = lines.findIndex((line) => CLAUDE_LIMIT_PATTERNS.some((p) => p.test(line)));
    if (index === -1) {
      return undefined;
    }

    // The reset time can be on the next line of the page.
    return shorten(lines.slice(index, index + 2).join(' '));
  }

  /**
   * Wait until the answer stops changing. It returns the answer text.
   * It returns a signal when the page shows one before the answer starts.
   */
  private async waitForAnswer(
    page: ProviderPage,
    requestText: string,
    timeoutMs: number,
  ): Promise<string | ProviderSignal> {
    const deadline = Date.now() + timeoutMs;
    let previous = '';
    let stableReads = 0;

    while (Date.now() < deadline) {
      const text = ((await page.textOf(CLAUDE_SELECTORS.assistantText)) ?? '').trim();

      if (text === '') {
        const signal = await this.findSignal(page, requestText);
        if (signal !== undefined) {
          return signal;
        }
      }

      if (await page.isVisible(CLAUDE_SELECTORS.streaming)) {
        stableReads = 0;
        previous = text;
        await page.waitForTimeout(this.pollIntervalMs);
        continue;
      }

      if (text !== '' && text === previous) {
        stableReads += 1;
      } else {
        stableReads = 0;
      }

      previous = text;

      if (stableReads >= STABLE_READS) {
        return text;
      }

      await page.waitForTimeout(this.pollIntervalMs);
    }

    throw new ProviderError('The Claude answer did not finish in time.', {
      hint: 'Try the request again.',
    });
  }
}

/**
 * Read the reset time from a limit message. It returns undefined when the message has none.
 * The message can state a clock time ("5 PM") or a wait ("in 2 hours").
 */
export function parseResetTime(message: string, now: Date): Date | undefined {
  const wait = /\bin\s+(?:(\d+)\s*hours?)?(?:\s*(?:and\s+)?(\d+)\s*minutes?)?/i.exec(message);
  if (wait !== null && (wait[1] !== undefined || wait[2] !== undefined)) {
    const hours = Number(wait[1] ?? 0);
    const minutes = Number(wait[2] ?? 0);
    return new Date(now.getTime() + (hours * 60 + minutes) * 60_000);
  }

  const clock = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/i.exec(message);
  if (clock === null) {
    return undefined;
  }

  const hour12 = Number(clock[1]);
  const minute = Number(clock[2] ?? 0);
  if (hour12 < 1 || hour12 > 12 || minute > 59) {
    return undefined;
  }

  const isPm = clock[3]?.toLowerCase() === 'p';
  const hour24 = (hour12 % 12) + (isPm ? 12 : 0);

  const reset = new Date(now);
  reset.setHours(hour24, minute, 0, 0);
  if (reset.getTime() <= now.getTime()) {
    reset.setDate(reset.getDate() + 1);
  }

  return reset;
}

/** Make the typed error for a page element that the adapter cannot use. */
function missingSelector(what: string, selector: string, cause: unknown): ProviderError {
  return new ProviderError(`The Claude ${what} is not usable. The selector is ${selector}.`, {
    hint: 'The page layout may have changed. Update src/providers/claude/selectors.ts.',
    cause,
  });
}

/** Remove the request text from the page text. */
function withoutRequest(text: string, requestText: string | undefined): string {
  if (requestText === undefined || requestText === '') {
    return text;
  }

  return text.split(requestText).join('');
}

/** Cut a message to a safe length for the log. */
function shorten(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_MESSAGE_LENGTH ? `${flat.slice(0, MAX_MESSAGE_LENGTH)}...` : flat;
}
