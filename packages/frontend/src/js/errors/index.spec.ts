import { API_ERROR_CODES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  ApiErrorResponseError,
  getApiErrorMessage,
  getPayeeNameConflict,
  isApiErrorWithCode,
  isNotFoundError,
  isResourceMissingError,
} from './index';

describe('isApiErrorWithCode', () => {
  it('returns true when error is ApiErrorResponseError with matching code', () => {
    const error = new ApiErrorResponseError('boom', { code: API_ERROR_CODES.conflict });
    expect(isApiErrorWithCode(error, API_ERROR_CODES.conflict)).toBe(true);
  });

  it('returns false when code does not match', () => {
    const error = new ApiErrorResponseError('boom', { code: API_ERROR_CODES.conflict });
    expect(isApiErrorWithCode(error, API_ERROR_CODES.notFound)).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isApiErrorWithCode(new Error('plain'), API_ERROR_CODES.notFound)).toBe(false);
  });

  it('returns false when ApiErrorResponseError is constructed without data', () => {
    const error = new ApiErrorResponseError('broken', undefined as never);
    expect(isApiErrorWithCode(error, API_ERROR_CODES.notFound)).toBe(false);
  });

  it.each([null, undefined, 'string', 42, {}])('returns false for non-Error value %s', (value) => {
    expect(isApiErrorWithCode(value, API_ERROR_CODES.notFound)).toBe(false);
  });
});

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

describe('getPayeeNameConflict', () => {
  const conflictingPayee = { id: 'payee-1', name: 'Globex' };
  const buildConflict = (details: unknown) =>
    new ApiErrorResponseError('conflict', { code: API_ERROR_CODES.conflict, details } as never);

  it('returns the conflictingPayee from a 409 with a well-formed details payload', () => {
    expect(getPayeeNameConflict(buildConflict({ conflictingPayee }))).toEqual(conflictingPayee);
  });

  it('returns null for a 409 without details', () => {
    expect(getPayeeNameConflict(buildConflict(undefined))).toBeNull();
  });

  it.each([
    { conflictingPayee: { id: 42, name: 'Globex' } },
    { conflictingPayee: { id: 'payee-1' } },
    { conflictingPayee: 'payee-1' },
    { somethingElse: true },
  ])('returns null when the details shape does not match (%j)', (details) => {
    expect(getPayeeNameConflict(buildConflict(details))).toBeNull();
  });

  it('returns null for a non-conflict API error even with a matching details shape', () => {
    const error = new ApiErrorResponseError('boom', {
      code: API_ERROR_CODES.validationError,
      details: { conflictingPayee },
    } as never);
    expect(getPayeeNameConflict(error)).toBeNull();
  });

  it.each([null, undefined, 'string', 42, {}, new Error('plain')])('returns null for non-API error %s', (value) => {
    expect(getPayeeNameConflict(value)).toBeNull();
  });
});

describe('getApiErrorMessage', () => {
  const t = (key: string) => `t:${key}`;
  const keys = { conflictKey: 'conflict', fallbackKey: 'fallback' };

  it('returns the translated conflict key for a conflict error', () => {
    const error = new ApiErrorResponseError('boom', { code: API_ERROR_CODES.conflict });
    expect(getApiErrorMessage({ e: error, t, ...keys })).toBe('t:conflict');
  });

  it('returns the first Zod validation message for a validation error', () => {
    const error = new ApiErrorResponseError('body.currentBalanceAsOf: must not be in the future', {
      code: API_ERROR_CODES.validationError,
      validationErrors: [
        { path: ['body', 'currentBalanceAsOf'], message: 'currentBalanceAsOf must not be in the future' },
        { path: ['body', 'name'], message: 'Required' },
      ],
    } as never);
    expect(getApiErrorMessage({ e: error, t, ...keys })).toBe('currentBalanceAsOf must not be in the future');
  });

  it('falls back to the fallback key when a validation error carries no messages', () => {
    const error = new ApiErrorResponseError('boom', {
      code: API_ERROR_CODES.validationError,
      validationErrors: [],
    } as never);
    expect(getApiErrorMessage({ e: error, t, ...keys })).toBe('t:fallback');
  });

  it('falls back to the fallback key for an unexpected API error', () => {
    const error = new ApiErrorResponseError('boom', { code: API_ERROR_CODES.unexpected });
    expect(getApiErrorMessage({ e: error, t, ...keys })).toBe('t:fallback');
  });

  it.each([null, undefined, 'string', 42, {}, new Error('plain')])(
    'falls back to the fallback key for non-API error %s',
    (value) => {
      expect(getApiErrorMessage({ e: value, t, ...keys })).toBe('t:fallback');
    },
  );
});
