import { afterEach, describe, expect, it, jest } from '@jest/globals';

// Mock the Sentry wrapper `logger.ts` imports so tests never touch the real
// `@sentry/node` client and can assert on capture calls directly.
const captureException = jest.fn();
const captureMessage = jest.fn();
const withScope = jest.fn((callback: (scope: unknown) => void) => {
  callback({ setExtras: jest.fn(), setExtra: jest.fn(), setTag: jest.fn() });
});

jest.mock('./sentry', () => ({
  isSentryEnabled: () => true,
  Sentry: {
    withScope: (callback: (scope: unknown) => void) => withScope(callback),
    captureException: (error: unknown) => captureException(error),
    captureMessage: (message: string, level: string) => captureMessage(message, level),
  },
}));

// eslint-disable-next-line import/first
import { NotFoundError, UnexpectedError, ValidationError } from '@js/errors';

// eslint-disable-next-line import/first
import { logger } from './logger';

describe('logger.error Sentry capture', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not capture a ValidationError (4xx CustomError)', () => {
    logger.error(new ValidationError({ message: 'x' }));

    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not capture a NotFoundError (4xx CustomError)', () => {
    logger.error(new NotFoundError({ message: 'x' }));

    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures an UnexpectedError (5xx CustomError)', () => {
    logger.error(new UnexpectedError({ message: 'boom' }));

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('captures a non-CustomError', () => {
    logger.error(new Error('raw'));

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('does not capture a 4xx CustomError passed via the { message, error } object form', () => {
    logger.error({ error: new ValidationError({ message: 'x' }), message: 'ctx' });

    expect(captureException).not.toHaveBeenCalled();
  });
});
