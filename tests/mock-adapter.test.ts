import { describe, expect, it } from 'vitest';

import { ProviderError } from '../src/core/errors.js';
import { createMockAdapter, MockAdapter } from '../src/providers/mock/mock-adapter.js';
import { isAnswer, isSignal } from '../src/providers/types.js';
import type { ProviderPage } from '../src/providers/types.js';

const page = {} as ProviderPage;

describe('MockAdapter', () => {
  it('returns the scripted answer', async () => {
    const adapter = createMockAdapter({ kind: 'answer', text: 'The scripted answer.' });

    const result = await adapter.send(page, { text: 'a task' });

    expect(isAnswer(result)).toBe(true);
    expect(result.kind === 'answer' ? result.text : '').toBe('The scripted answer.');
  });

  it('returns the limit signal', async () => {
    const resetAt = new Date('2026-10-27T00:00:00.000Z');
    const adapter = createMockAdapter({ kind: 'limitReached', resetAt, message: 'Limit reached.' });

    const result = await adapter.send(page, { text: 'a task' });

    expect(isSignal(result)).toBe(true);
    expect(result.kind).toBe('limitReached');
    expect(result.kind === 'limitReached' ? result.resetAt : undefined).toEqual(resetAt);
  });

  it('returns the limit signal without a reset time', async () => {
    const adapter = createMockAdapter({ kind: 'limitReached' });

    const result = await adapter.send(page, { text: 'a task' });

    expect(result.kind).toBe('limitReached');
    expect(result.kind === 'limitReached' ? result.resetAt : 'set').toBeUndefined();
  });

  it('returns the captcha signal', async () => {
    const adapter = createMockAdapter({ kind: 'captchaRequired', message: 'Human check.' });

    const result = await adapter.send(page, { text: 'a task' });

    expect(result.kind).toBe('captchaRequired');
  });

  it('returns the session expired signal', async () => {
    const adapter = createMockAdapter({ kind: 'sessionExpired' });

    const result = await adapter.send(page, { text: 'a task' });

    expect(result.kind).toBe('sessionExpired');
  });

  it('throws a typed error for a scripted failure', async () => {
    const adapter = createMockAdapter({ kind: 'failure', message: 'The page layout changed.' });

    await expect(adapter.send(page, { text: 'a task' })).rejects.toBeInstanceOf(ProviderError);
  });

  it('records the requests that it received', async () => {
    const adapter = new MockAdapter();

    await adapter.send(page, { text: 'first task', model: 'mock-small' });
    await adapter.send(page, { text: 'second task' });

    expect(adapter.requests).toHaveLength(2);
    expect(adapter.requests[0]?.text).toBe('first task');
    expect(adapter.requests[0]?.model).toBe('mock-small');
  });

  it('reports the signed-in state', async () => {
    const adapter = new MockAdapter();
    expect(await adapter.isSignedIn(page)).toBe(true);

    adapter.setSignedIn(false);
    expect(await adapter.isSignedIn(page)).toBe(false);
  });

  it('has a name, a login page, and models', () => {
    const adapter = new MockAdapter();

    expect(adapter.name).toBe('mock');
    expect(adapter.loginUrl).toBe('https://mock.test/login');
    expect(adapter.models).toEqual(['mock-small', 'mock-large']);
  });
});
