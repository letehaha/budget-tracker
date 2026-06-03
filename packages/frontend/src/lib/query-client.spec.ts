import { ApiErrorResponseError, AuthError, NetworkError, UnexpectedError } from '@/js/errors';
import { API_ERROR_CODES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { shouldRetryQuery } from './query-client';

const apiError = (code: API_ERROR_CODES) => new ApiErrorResponseError('boom', { code });

describe('shouldRetryQuery', () => {
  it('never retries AuthError', () => {
    expect(shouldRetryQuery(0, new AuthError({ code: API_ERROR_CODES.unauthorized }))).toBe(false);
  });

  it('never retries UnexpectedError', () => {
    expect(shouldRetryQuery(0, new UnexpectedError('parse fail'))).toBe(false);
  });

  it.each([
    API_ERROR_CODES.forbidden,
    API_ERROR_CODES.notFound,
    API_ERROR_CODES.notAllowed,
    API_ERROR_CODES.BadRequest,
    API_ERROR_CODES.validationError,
    API_ERROR_CODES.conflict,
    API_ERROR_CODES.invalidCredentials,
    API_ERROR_CODES.userExists,
    API_ERROR_CODES.categoryHasTransactions,
    API_ERROR_CODES.locked,
    API_ERROR_CODES.baseCurrencyChangeInProgress,
    API_ERROR_CODES.payloadTooLarge,
  ])('does not retry ApiErrorResponseError with non-retryable code %s', (code) => {
    expect(shouldRetryQuery(0, apiError(code))).toBe(false);
  });

  it.each([API_ERROR_CODES.tooManyRequests, API_ERROR_CODES.badGateway, API_ERROR_CODES.unexpected])(
    'retries ApiErrorResponseError with retryable code %s under the limit',
    (code) => {
      expect(shouldRetryQuery(0, apiError(code))).toBe(true);
      expect(shouldRetryQuery(2, apiError(code))).toBe(true);
    },
  );

  it.each([API_ERROR_CODES.tooManyRequests, API_ERROR_CODES.badGateway])(
    'stops retrying retryable code %s once the failure limit is reached',
    (code) => {
      expect(shouldRetryQuery(3, apiError(code))).toBe(false);
    },
  );

  it('retries NetworkError up to the default limit', () => {
    const err = new NetworkError('offline');
    expect(shouldRetryQuery(0, err)).toBe(true);
    expect(shouldRetryQuery(2, err)).toBe(true);
    expect(shouldRetryQuery(3, err)).toBe(false);
  });

  it('retries unknown errors up to the default limit', () => {
    expect(shouldRetryQuery(0, new Error('flaky'))).toBe(true);
    expect(shouldRetryQuery(2, new Error('flaky'))).toBe(true);
    expect(shouldRetryQuery(3, new Error('flaky'))).toBe(false);
  });

  it.each([null, undefined, 'string error', 42])(
    'retries non-Error values like %s up to the default limit',
    (value) => {
      expect(shouldRetryQuery(0, value)).toBe(true);
      expect(shouldRetryQuery(3, value)).toBe(false);
    },
  );
});
