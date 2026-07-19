import { describe, expect, it } from '@jest/globals';

import { shouldUseSecureCookies } from './should-use-secure-cookies';

describe('shouldUseSecureCookies', () => {
  it('enables secure cookies for a production build served over https', () => {
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'https://api.moneymatter.app' })).toBe(true);
  });

  it('is case-insensitive about the scheme', () => {
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'HTTPS://budget.example.com' })).toBe(true);
  });

  it('keeps cookies plain for a production build served over http (self-host trial)', () => {
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'http://192.168.1.20:8080' })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'http://localhost:8080' })).toBe(false);
  });

  it('keeps cookies plain outside production even over https', () => {
    expect(shouldUseSecureCookies({ nodeEnv: 'development', betterAuthUrl: 'https://localhost:8081' })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: 'test', betterAuthUrl: 'https://localhost:8081' })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: undefined, betterAuthUrl: 'https://localhost:8081' })).toBe(false);
  });

  it('keeps cookies plain when the URL is unset or empty', () => {
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: undefined })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: '' })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: '   ' })).toBe(false);
  });

  it('keeps cookies plain when the URL is malformed or has a non-https scheme', () => {
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'budget.example.com' })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'htps://budget.example.com' })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'https:/one-slash.example' })).toBe(false);
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: 'ftp://budget.example.com' })).toBe(false);
  });

  it('tolerates surrounding whitespace in the URL', () => {
    expect(shouldUseSecureCookies({ nodeEnv: 'production', betterAuthUrl: '  https://budget.example.com  ' })).toBe(
      true,
    );
  });
});
