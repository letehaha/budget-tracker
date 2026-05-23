import { API_ERROR_CODES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { ApiErrorResponseError, isNotFoundError, isResourceMissingError } from './index';

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

describe('isResourceMissingError', () => {
  const buildValidationError = (validationErrors: unknown) =>
    new ApiErrorResponseError('boom', {
      code: API_ERROR_CODES.validationError,
      validationErrors,
    } as never);

  it('returns true for a real NotFound', () => {
    expect(isResourceMissingError(new ApiErrorResponseError('nope', { code: API_ERROR_CODES.notFound }))).toBe(true);
  });

  it('returns true when every validation failure is on a URL path param', () => {
    expect(isResourceMissingError(buildValidationError([{ path: ['params', 'id'], message: 'Invalid UUID' }]))).toBe(
      true,
    );
  });

  it('returns true when every validation failure is on a query param', () => {
    expect(
      isResourceMissingError(buildValidationError([{ path: ['query', 'page'], message: 'Expected number' }])),
    ).toBe(true);
  });

  it('returns false when validation failure is on the request body', () => {
    expect(isResourceMissingError(buildValidationError([{ path: ['body', 'name'], message: 'Required' }]))).toBe(false);
  });

  it('returns false when validation failures are mixed across params and body', () => {
    expect(
      isResourceMissingError(
        buildValidationError([
          { path: ['params', 'id'], message: 'Invalid UUID' },
          { path: ['body', 'name'], message: 'Required' },
        ]),
      ),
    ).toBe(false);
  });

  it('returns false when validation error has no validationErrors array', () => {
    expect(isResourceMissingError(buildValidationError(undefined))).toBe(false);
  });

  it('returns false when validationErrors array is empty', () => {
    expect(isResourceMissingError(buildValidationError([]))).toBe(false);
  });

  it('returns false when validationErrors entries have no path info', () => {
    expect(isResourceMissingError(buildValidationError([{ message: 'broken' }]))).toBe(false);
  });

  it.each([API_ERROR_CODES.forbidden, API_ERROR_CODES.conflict, API_ERROR_CODES.unexpected])(
    'returns false for ApiErrorResponseError with code %s',
    (code) => {
      expect(isResourceMissingError(new ApiErrorResponseError('boom', { code }))).toBe(false);
    },
  );

  it('returns false for plain Error', () => {
    expect(isResourceMissingError(new Error('plain'))).toBe(false);
  });

  it.each([null, undefined, 'string', 42, {}])('returns false for non-Error value %s', (value) => {
    expect(isResourceMissingError(value)).toBe(false);
  });

  it('returns false when ApiErrorResponseError is constructed without data', () => {
    const error = new ApiErrorResponseError('broken', undefined as never);
    expect(isResourceMissingError(error)).toBe(false);
  });
});
