/** The signal that a provider shows a usage limit or a rate limit. */
export interface LimitReached {
  readonly kind: 'limitReached';
  /** The time when the account can be used again, when the page states it. */
  readonly resetAt?: Date;
  /** The text of the limit message, for the log. */
  readonly message?: string;
}

/** The signal that a provider shows a CAPTCHA or a human check. */
export interface CaptchaRequired {
  readonly kind: 'captchaRequired';
  /** The text of the message, for the log. */
  readonly message?: string;
}

/** The signal that a provider page shows a sign-in screen. */
export interface SessionExpired {
  readonly kind: 'sessionExpired';
  /** The text of the message, for the log. */
  readonly message?: string;
}

/** The signals that an adapter returns instead of an answer. */
export type ProviderSignal = LimitReached | CaptchaRequired | SessionExpired;

/** An answer. The adapter sets `model` when the page shows which model answered. */
export interface ProviderAnswer {
  readonly kind: 'answer';
  readonly text: string;
  readonly model?: string;
  /** The address of the provider chat that holds this answer. A later request can reuse it. */
  readonly chatUrl?: string;
}

/** The result of an adapter call. It is an answer or a signal. */
export type ProviderResult = ProviderAnswer | ProviderSignal;

/** A request that goes to a provider. */
export interface ProviderRequest {
  /** The text of the request. */
  readonly text: string;
  /** The model to use. The adapter picks the closest model that it supports. */
  readonly model?: string;
  /** The time limit in milliseconds. */
  readonly timeoutMs?: number;
  /** The provider chat to continue. Without it, the adapter starts a new chat. */
  readonly chatUrl?: string;
}

import type { BrowserPage } from '../browser/types.js';

/** The page that an adapter works on. The browser launcher starts the browser. */
export type ProviderPage = BrowserPage;

/** The contract of a provider adapter. */
export interface ProviderAdapter {
  /** The provider name in lowercase. Example: `claude`. */
  readonly name: string;
  /** The page that the visible browser opens for the login. */
  readonly loginUrl: string;
  /** The models that the adapter can use, from the cheapest to the most capable. */
  readonly models: readonly string[];
  /** Return true when the page shows a signed-in account. */
  isSignedIn(page: ProviderPage): Promise<boolean>;
  /** Send one request in a new provider chat and return the answer or a signal. */
  send(page: ProviderPage, request: ProviderRequest): Promise<ProviderResult>;
}

/** Return true when the result is a signal. */
export function isSignal(result: ProviderResult): result is ProviderSignal {
  return result.kind !== 'answer';
}

/** Return true when the result is the answer text. */
export function isAnswer(result: ProviderResult): result is ProviderAnswer {
  return result.kind === 'answer';
}
