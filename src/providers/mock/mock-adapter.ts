import { ProviderError } from '../../core/errors.js';
import type { ProviderAdapter, ProviderPage, ProviderRequest, ProviderResult } from '../types.js';

/** What the mock adapter returns for one request. */
export type MockScript =
  | { readonly kind: 'answer'; readonly text: string }
  | { readonly kind: 'limitReached'; readonly resetAt?: Date; readonly message?: string }
  | { readonly kind: 'captchaRequired'; readonly message?: string }
  | { readonly kind: 'sessionExpired'; readonly message?: string }
  | { readonly kind: 'failure'; readonly message?: string };

/** The state of the mock adapter. */
export interface MockAdapterState {
  /** The signed-in state that `isSignedIn` returns. */
  signedIn: boolean;
  /** The script for the next request. */
  next: MockScript;
  /** The requests that the adapter received. */
  requests: ProviderRequest[];
}

/** A mock adapter that returns scripted results. All tests use it. */
export class MockAdapter implements ProviderAdapter {
  readonly name: string;
  readonly loginUrl: string;
  readonly models: readonly string[];

  private readonly state: MockAdapterState;

  constructor(options: { name?: string; models?: readonly string[] } = {}) {
    this.name = options.name ?? 'mock';
    this.loginUrl = `https://${this.name}.test/login`;
    this.models = options.models ?? ['mock-small', 'mock-large'];
    this.state = {
      signedIn: true,
      next: { kind: 'answer', text: 'A mock answer.' },
      requests: [],
    };
  }

  /** The current state of the mock. */
  get script(): MockAdapterState {
    return this.state;
  }

  /** Set the result of the next request. */
  setNext(script: MockScript): void {
    this.state.next = script;
  }

  /** Set the signed-in state. */
  setSignedIn(signedIn: boolean): void {
    this.state.signedIn = signedIn;
  }

  /** The requests that the adapter received. */
  get requests(): readonly ProviderRequest[] {
    return this.state.requests;
  }

  async isSignedIn(_page: ProviderPage): Promise<boolean> {
    return this.state.signedIn;
  }

  async send(_page: ProviderPage, request: ProviderRequest): Promise<ProviderResult> {
    this.state.requests.push(request);

    const script = this.state.next;
    switch (script.kind) {
      case 'answer':
        return { kind: 'answer', text: script.text };
      case 'limitReached':
        return script.resetAt === undefined
          ? {
              kind: 'limitReached',
              ...(script.message === undefined ? {} : { message: script.message }),
            }
          : {
              kind: 'limitReached',
              resetAt: script.resetAt,
              ...(script.message === undefined ? {} : { message: script.message }),
            };
      case 'captchaRequired':
        return {
          kind: 'captchaRequired',
          ...(script.message === undefined ? {} : { message: script.message }),
        };
      case 'sessionExpired':
        return {
          kind: 'sessionExpired',
          ...(script.message === undefined ? {} : { message: script.message }),
        };
      case 'failure':
        throw new ProviderError(script.message ?? 'The mock adapter failed.', {
          hint: 'This is a scripted failure for a test.',
        });
    }
  }
}

/** Make a mock adapter with a scripted result. */
export function createMockAdapter(
  script: MockScript = { kind: 'answer', text: 'A mock answer.' },
): MockAdapter {
  const adapter = new MockAdapter();
  adapter.setNext(script);
  return adapter;
}
