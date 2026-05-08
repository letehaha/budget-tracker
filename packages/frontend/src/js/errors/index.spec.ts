import { API_ERROR_CODES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { ApiErrorResponseError, isNotFoundError } from './index';

describe('isNotFoundError', () => {
  it('returns true for ApiErrorResponseError with notFound code', () => {
    const error = new ApiErrorResponseError('not found', { code: API_ERROR_CODES.notFound });
    expect(isNotFoundError(error)).toBe(true);
  });

  it.each([
    API_ERROR_CODES.forbidden,
    API_ERROR_CODES.conflict,
    API_ERROR_CODES.unexpected,
    API_ERROR_CODES.validationError,
  ])('returns false for ApiErrorResponseError with code %s', (code) => {
    expect(isNotFoundError(new ApiErrorResponseError('boom', { code }))).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isNotFoundError(new Error('plain'))).toBe(false);
  });

  it.each([null, undefined, 'string', 42, {}])('returns false for non-Error value %s', (value) => {
    expect(isNotFoundError(value)).toBe(false);
  });

  it('returns false when ApiErrorResponseError is constructed without data', () => {
    const error = new ApiErrorResponseError('broken', undefined as never);
    expect(isNotFoundError(error)).toBe(false);
  });
});
