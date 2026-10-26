import { describe, expect, it } from 'vitest';

import { AppError, ConfigError, PlannedError } from '../src/core/errors.js';

describe('typed errors', () => {
  it('carries a code, a hint, and a cause', () => {
    const cause = new Error('root cause');

    const error = new AppError('TEST_ERROR', 'The test failed.', {
      hint: 'Run the test again.',
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.hint).toBe('Run the test again.');
    expect(error.cause).toBe(cause);
  });

  it('gives a subclass a fixed code and its own name', () => {
    const error = new ConfigError('The config value is bad.');

    expect(error.name).toBe('ConfigError');
    expect(error.code).toBe('CONFIG_ERROR');
  });

  it('makes a clear message for a planned feature', () => {
    const error = new PlannedError('Linux');

    expect(error.code).toBe('PLANNED');
    expect(error.message).toBe('Linux is Planned.');
  });
});
