import { describe, expect, it } from '@jest/globals';
import { APICallError, RetryError } from 'ai';

import { isAuthError, isTemporaryError } from './api-key-validation';

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
