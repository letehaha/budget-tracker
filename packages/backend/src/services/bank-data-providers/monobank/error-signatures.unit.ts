import { describe, expect, it } from '@jest/globals';

import { isGeoBlockResponseBody, isUnknownAccountResponse } from './error-signatures';

describe('isUnknownAccountResponse', () => {
  it('matches the 400 Monobank returns for an account id it does not recognise', () => {
    expect(isUnknownAccountResponse({ status: 400, errorDescription: "invalid 'account'" })).toBe(true);
  });

  it('tolerates surrounding whitespace and casing', () => {
    expect(isUnknownAccountResponse({ status: 400, errorDescription: "  Invalid 'Account'  " })).toBe(true);
  });

  it('ignores other 400s so genuine request bugs keep their retry + Sentry path', () => {
    expect(isUnknownAccountResponse({ status: 400, errorDescription: "invalid 'from'" })).toBe(false);
    expect(isUnknownAccountResponse({ status: 400, errorDescription: 'Bad Request' })).toBe(false);
    expect(isUnknownAccountResponse({ status: 400, errorDescription: undefined })).toBe(false);
  });

  it('ignores non-400 statuses carrying the same description', () => {
    expect(isUnknownAccountResponse({ status: 500, errorDescription: "invalid 'account'" })).toBe(false);
    expect(isUnknownAccountResponse({ status: undefined, errorDescription: "invalid 'account'" })).toBe(false);
  });

  it('ignores non-string descriptions', () => {
    expect(isUnknownAccountResponse({ status: 400, errorDescription: { nested: true } })).toBe(false);
  });
});

describe('isGeoBlockResponseBody', () => {
  it('matches the plain-text edge rejection in both languages', () => {
    expect(isGeoBlockResponseBody('Change your IP address and try again')).toBe(true);
    expect(isGeoBlockResponseBody('Змініть IP та спробуйте ще раз')).toBe(true);
  });

  it('ignores JSON bodies and unrelated text', () => {
    expect(isGeoBlockResponseBody({ errorDescription: "Unknown 'X-Token'" })).toBe(false);
    expect(isGeoBlockResponseBody('Forbidden')).toBe(false);
    expect(isGeoBlockResponseBody(undefined)).toBe(false);
  });
});
