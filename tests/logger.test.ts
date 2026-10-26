import { describe, expect, it } from 'vitest';

import { Logger } from '../src/core/logger.js';

function createCapturedLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger = new Logger({
    sink: {
      write: (line) => {
        lines.push(line);
      },
    },
    now: () => new Date('2026-10-26T00:00:00.000Z'),
  });

  return { logger, lines };
}

describe('Logger', () => {
  it('hides a fake token and a fake key', () => {
    const fakeToken = 'sk-test-token-1234567890';
    const fakeKey = 'fake-key-for-tests';
    const { logger, lines } = createCapturedLogger();

    logger.info(`login failed with token ${fakeToken}`, {
      apiKey: fakeKey,
      provider: 'claude',
    });

    const output = lines.join('');
    expect(output).not.toContain(fakeToken);
    expect(output).not.toContain(fakeKey);
    expect(output).toContain('claude');
    expect(output).toContain('[REDACTED]');
  });

  it('hides a bearer token inside a message', () => {
    const fakeToken = 'test-token-value';
    const { logger, lines } = createCapturedLogger();

    logger.warn(`Authorization: Bearer ${fakeToken}`);

    const output = lines.join('');
    expect(output).not.toContain(fakeToken);
    expect(output).toContain('Bearer [REDACTED]');
  });

  it('hides a secret in a nested value', () => {
    const fakeCookie = 'fake-cookie-for-tests';
    const { logger, lines } = createCapturedLogger();

    logger.info('request failed', {
      account: { sessionCookie: fakeCookie },
      attempts: 2,
    });

    const output = lines.join('');
    expect(output).not.toContain(fakeCookie);
    expect(output).toContain('"attempts":2');
  });

  it('writes a debug message at the debug level', () => {
    const lines: string[] = [];
    const logger = new Logger({
      level: 'debug',
      sink: {
        write: (line) => {
          lines.push(line);
        },
      },
    });

    logger.debug('the detail');

    expect(lines).toHaveLength(1);
    expect(lines.join('')).toContain('"level":"debug"');
  });

  it('hides a debug message below the configured level', () => {
    const lines: string[] = [];
    const logger = new Logger({
      level: 'warn',
      sink: {
        write: (line) => {
          lines.push(line);
        },
      },
    });

    logger.info('hidden');
    logger.warn('shown');

    expect(lines).toHaveLength(1);
    expect(lines.join('')).toContain('shown');
  });
});
