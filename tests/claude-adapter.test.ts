import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBrowserLauncher } from '../src/browser/launcher.js';
import type { BrowserSession } from '../src/browser/types.js';
import { ProviderError } from '../src/core/errors.js';
import { ClaudeAdapter, parseResetTime } from '../src/providers/claude/claude-adapter.js';
import { CLAUDE_SELECTORS } from '../src/providers/claude/selectors.js';

const fixturesFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'claude',
);

let browser: BrowserSession;

beforeAll(async () => {
  browser = await createBrowserLauncher().launch({
    purpose: 'request',
    startUrl: 'about:blank',
  });
}, 60_000);

afterAll(async () => {
  await browser.close();
}, 60_000);

describe('ClaudeAdapter', () => {
  it('reports a signed-out page', async () => {
    await withServer({ '/login': 'login.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({ baseUrl });
      await browser.page.goto(`${baseUrl}/login`);

      expect(await adapter.isSignedIn(browser.page)).toBe(false);
    });
  }, 30_000);

  it('reports a signed-in page', async () => {
    await withServer({ '/chat': 'chat.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({ baseUrl });
      await browser.page.goto(`${baseUrl}/chat`);

      expect(await adapter.isSignedIn(browser.page)).toBe(true);
    });
  }, 30_000);

  it('sends a request and reads the answer', async () => {
    await withServer({ '/new': 'chat.html', '/answer': 'answer.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({
        baseUrl,
        answerTimeoutMs: 10_000,
        pollIntervalMs: 50,
      });

      const result = await adapter.send(browser.page, {
        text: 'Reply with exactly: ready',
      });

      expect(result).toEqual({ kind: 'answer', text: 'ready' });
    });
  }, 30_000);

  it('detects a limit message', async () => {
    await withServer({ '/new': 'limit.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({ baseUrl, answerTimeoutMs: 10_000 });

      const result = await adapter.send(browser.page, { text: 'a task' });

      expect(result.kind).toBe('limitReached');
    });
  }, 30_000);

  it('detects a CAPTCHA page', async () => {
    await withServer({ '/new': 'captcha.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({ baseUrl, answerTimeoutMs: 10_000 });

      const result = await adapter.send(browser.page, { text: 'a task' });

      expect(result.kind).toBe('captchaRequired');
    });
  }, 30_000);

  it('reports a signed-out page on send', async () => {
    await withServer({ '/new': 'login.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({ baseUrl, answerTimeoutMs: 10_000 });

      const result = await adapter.send(browser.page, { text: 'a task' });

      expect(result.kind).toBe('sessionExpired');
    });
  }, 30_000);

  it('types the request text and waits for a streamed answer', async () => {
    await withServer({ '/new': 'stream.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({
        baseUrl,
        answerTimeoutMs: 10_000,
        pollIntervalMs: 50,
      });

      const result = await adapter.send(browser.page, { text: 'ping' });

      expect(result).toEqual({
        kind: 'answer',
        text: 'You said: ping. Done.',
        model: 'Sonnet 5.5 Medium',
      });
    });
  }, 30_000);

  it('does not treat the request or the answer as a signal', async () => {
    await withServer({ '/new': 'stream.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({
        baseUrl,
        answerTimeoutMs: 10_000,
        pollIntervalMs: 50,
      });
      const text = 'Explain the message limit. Verify you are human is a CAPTCHA text.';

      const result = await adapter.send(browser.page, { text });

      expect(result).toMatchObject({ kind: 'answer', text: `You said: ${text}. Done.` });
    });
  }, 30_000);

  it('reads the reset time of a limit message', async () => {
    await withServer({ '/new': 'limit.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({
        baseUrl,
        answerTimeoutMs: 10_000,
        now: () => new Date(2026, 0, 1, 10, 0),
      });

      const result = await adapter.send(browser.page, { text: 'a task' });

      expect(result).toMatchObject({
        kind: 'limitReached',
        resetAt: new Date(2026, 0, 1, 17, 0),
      });
    });
  }, 30_000);

  it('throws a typed error that names the selector when the layout changed', async () => {
    await withServer({ '/new': 'layout.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({ baseUrl, answerTimeoutMs: 500 });

      const error = await adapter.send(browser.page, { text: 'a task' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).message).toContain(CLAUDE_SELECTORS.composer);
    });
  }, 30_000);

  it('throws a typed timeout error when the page never answers', async () => {
    await withServer({ '/new': 'chat.html', '/answer': 'chat.html' }, async (baseUrl) => {
      const adapter = new ClaudeAdapter({ baseUrl, answerTimeoutMs: 10_000, pollIntervalMs: 50 });

      const error = await adapter
        .send(browser.page, { text: 'a task', timeoutMs: 600 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).message).toContain('did not finish in time');
    });
  }, 30_000);
});

describe('parseResetTime', () => {
  const now = new Date(2026, 0, 1, 10, 0);

  it.each([
    ['Try again at 5 PM.', new Date(2026, 0, 1, 17, 0)],
    ['Your limit will reset at 5:30 pm', new Date(2026, 0, 1, 17, 30)],
    ['Resets at 9 AM', new Date(2026, 0, 2, 9, 0)],
    ['Resets at 12 AM', new Date(2026, 0, 2, 0, 0)],
    ['Resets at 12 PM', new Date(2026, 0, 1, 12, 0)],
    ['Try again in 2 hours', new Date(2026, 0, 1, 12, 0)],
    ['Try again in 1 hour and 30 minutes', new Date(2026, 0, 1, 11, 30)],
    ['Try again in 45 minutes', new Date(2026, 0, 1, 10, 45)],
  ])('reads "%s"', (message, expected) => {
    expect(parseResetTime(message, now)).toEqual(expected);
  });

  it('returns undefined when the message has no time', () => {
    expect(parseResetTime("You've reached your message limit.", now)).toBeUndefined();
    expect(parseResetTime('Resets at 13 PM', now)).toBeUndefined();
  });
});

/** A local server that serves the snapshots of one test. */
interface TestServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

async function startServer(routes: Record<string, string>): Promise<TestServer> {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const fixture = routes[pathname];

    if (fixture === undefined) {
      response.writeHead(404);
      response.end('Not found.');
      return;
    }

    try {
      const html = await readFile(path.join(fixturesFolder, fixture), 'utf8');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    } catch {
      response.writeHead(500);
      response.end('The snapshot is missing.');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server has no port.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  };
}

async function withServer<T>(
  routes: Record<string, string>,
  action: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = await startServer(routes);

  try {
    return await action(server.baseUrl);
  } finally {
    await server.close();
  }
}
