import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@js/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { classifyAspspError, safeStringify } from './api-client';

describe('safeStringify', () => {
  it('serializes plain objects normally', () => {
    expect(safeStringify({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
  });

  it('falls back to String(value) for circular references', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(safeStringify(circular)).toBe('[object Object]');
  });

  it('falls back to String(value) for BigInt values that break JSON.stringify', () => {
    expect(safeStringify(10n)).toBe('10');
  });

  it('falls back when toJSON throws', () => {
    const value = {
      toJSON() {
        throw new Error('broken toJSON');
      },
    };
    expect(safeStringify(value)).toBe('[object Object]');
  });
});

describe('classifyAspspError', () => {
  describe('nested code branch', () => {
    it.each([
      ['string "401 UNAUTHORIZED"', '401 UNAUTHORIZED'],
      ['string "403 FORBIDDEN"', '403 FORBIDDEN'],
      ['string "401"', '401'],
      ['string with leading whitespace', '  403 forbidden'],
    ])('matches when error_data.code is %s', (_label, code) => {
      const result = classifyAspspError({ detail: { error_data: { code } } });
      expect(result).toEqual({ matched: true, reason: 'nested-code' });
    });

    it.each([401, 403])('matches when error_data.code is numeric %i', (code) => {
      const result = classifyAspspError({ detail: { error_data: { code } } });
      expect(result).toEqual({ matched: true, reason: 'nested-code' });
    });

    it.each([
      ['string "400"', '400 BAD REQUEST'],
      ['string "500"', '500 INTERNAL'],
      ['numeric 500', 500],
    ])('does not match when error_data.code is %s', (_label, code) => {
      const result = classifyAspspError({ detail: { error_data: { code } } });
      expect(result.matched).toBe(false);
    });
  });

  describe('nested status branch', () => {
    it.each([401, 403])('matches when error_data.status is numeric %i', (status) => {
      const result = classifyAspspError({ detail: { error_data: { status } } });
      expect(result).toEqual({ matched: true, reason: 'nested-status' });
    });

    it.each(['401', '403 FORBIDDEN'])('matches when error_data.status is string "%s"', (status) => {
      const result = classifyAspspError({ detail: { error_data: { status } } });
      expect(result).toEqual({ matched: true, reason: 'nested-status' });
    });

    it('does not match for 500-level numeric status', () => {
      expect(classifyAspspError({ detail: { error_data: { status: 500 } } }).matched).toBe(false);
    });
  });

  describe('keyword-match branch', () => {
    it.each([
      'Refresh token invalid',
      'refresh_token expired',
      'token expired',
      'token has been revoked',
      'session expired',
      'session is invalid',
      'consent revoked',
      'consent withdrawn',
      'reauthorization required',
      'Please reauthenticate',
      'Access token not allowed',
      'Forbidden, authenticated but access to resource is not allowed',
      'PSD2 consent has expired',
    ])('matches auth keyword in wrapper message: "%s"', (aspspMessage) => {
      const result = classifyAspspError({ detail: {}, aspspMessage });
      expect(result).toEqual({ matched: true, reason: 'keyword-match' });
    });

    it.each([
      'Operation forbidden by bank during maintenance window',
      'transaction date forbidden',
      'this character is not allowed in description',
      'unauthorized transactions report',
      'Invalid IBAN format',
      'Insufficient funds',
    ])('does NOT match unrelated wording with bare keywords: "%s"', (aspspMessage) => {
      const result = classifyAspspError({ detail: {}, aspspMessage });
      expect(result.matched).toBe(false);
    });

    it('matches when the auth keyword appears only in nested message', () => {
      const result = classifyAspspError({
        detail: { error_data: { message: 'Refresh token expired and must be renewed' } },
      });
      expect(result).toEqual({ matched: true, reason: 'keyword-match' });
    });
  });

  describe('missing or empty input', () => {
    it('returns no match for empty detail and undefined aspspMessage', () => {
      expect(classifyAspspError({ detail: {} }).matched).toBe(false);
    });

    it('returns no match when error_data is missing', () => {
      expect(classifyAspspError({ detail: { message: 'Operation failed' } }).matched).toBe(false);
    });

    it('returns no match when error_data fields are unexpected types', () => {
      expect(
        classifyAspspError({
          detail: { error_data: { code: { nested: 'object' }, status: ['array'], message: 12345 } },
        }).matched,
      ).toBe(false);
    });
  });
});
