import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@js/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock('./ai-client-factory', () => ({
  createAIClientWithConfig: jest.fn(() => ({})),
}));
jest.mock('ai', () => ({
  ...(jest.requireActual('ai') as object),
  generateText: jest.fn(),
}));

import { AI_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { APICallError, RetryError, generateText } from 'ai';

import { isAuthError, isTemporaryError, validateApiKey } from './api-key-validation';

const generateTextMock = generateText as unknown as jest.Mock<() => Promise<unknown>>;

// Minimal fields required by the APICallError constructor; url/requestBodyValues
// are irrelevant to the classifier but the SDK type requires them.
function buildApiCallError({ statusCode, isRetryable }: { statusCode?: number; isRetryable?: boolean }): APICallError {
  return new APICallError({
    message: 'api call failed',
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode,
    isRetryable,
  });
}

function buildRetryError({ lastError }: { lastError: unknown }): RetryError {
  return new RetryError({
    message: 'Failed after 3 attempts',
    reason: 'maxRetriesExceeded',
    errors: [lastError],
  });
}

describe('isTemporaryError', () => {
  it('returns true for a 429 rate-limit APICallError', () => {
    expect(isTemporaryError(buildApiCallError({ statusCode: 429 }))).toBe(true);
  });

  it('returns false for a 401 APICallError (auth error, not temporary)', () => {
    const error = buildApiCallError({ statusCode: 401 });
    expect(isTemporaryError(error)).toBe(false);
    expect(isAuthError(error)).toBe(true);
  });

  it('returns true for an isRetryable APICallError with no statusCode (connection/header timeout)', () => {
    expect(isTemporaryError(buildApiCallError({ isRetryable: true }))).toBe(true);
  });

  it('returns true for a RetryError wrapping a header-timeout APICallError', () => {
    const timeoutError = buildApiCallError({ isRetryable: true });
    expect(isTemporaryError(buildRetryError({ lastError: timeoutError }))).toBe(true);
  });

  it('returns false for a RetryError wrapping a 401 APICallError', () => {
    const authError = buildApiCallError({ statusCode: 401 });
    expect(isTemporaryError(buildRetryError({ lastError: authError }))).toBe(false);
  });

  it('returns false for an unrelated plain error', () => {
    expect(isTemporaryError(new Error('boom'))).toBe(false);
  });
});

describe('validateApiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns valid when the first validation model answers', async () => {
    generateTextMock.mockResolvedValueOnce({});

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result).toEqual({ isValid: true });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next model when the first rejects a non-auth 400 (account-gated model)', async () => {
    generateTextMock.mockRejectedValueOnce(buildApiCallError({ statusCode: 400 }));
    generateTextMock.mockResolvedValueOnce({});

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result).toEqual({ isValid: true });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('reports invalid at error level only after every model in the chain rejects', async () => {
    generateTextMock.mockRejectedValue(buildApiCallError({ statusCode: 400 }));

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result.isValid).toBe(false);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('stops at the first auth error without trying the fallback model, logging at info level', async () => {
    generateTextMock.mockRejectedValueOnce(buildApiCallError({ statusCode: 401 }));

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-bad' });

    expect(result.isValid).toBe(false);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('treats a rate-limited first model as a valid key', async () => {
    generateTextMock.mockRejectedValueOnce(buildApiCallError({ statusCode: 429 }));

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result).toEqual({ isValid: true });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});
