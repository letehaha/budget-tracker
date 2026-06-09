import { describe, expect, it } from 'vitest';

import { resolveApiHttpBase } from './api-base-url';

describe('resolveApiHttpBase', () => {
  it('returns the configured URL as-is in production', () => {
    expect(
      resolveApiHttpBase({
        isDev: false,
        configuredUrl: 'https://api.example.com',
        pageProtocol: 'https:',
        pageHostname: 'app.example.com',
      }),
    ).toBe('https://api.example.com');
  });

  it('uses page protocol/hostname with the configured port in dev', () => {
    expect(
      resolveApiHttpBase({
        isDev: true,
        configuredUrl: 'https://localhost:19541',
        pageProtocol: 'https:',
        pageHostname: '192.168.50.244',
      }),
    ).toBe('https://192.168.50.244:19541');
  });

  it('falls back to the default dev port when no URL is configured', () => {
    expect(
      resolveApiHttpBase({
        isDev: true,
        configuredUrl: undefined,
        pageProtocol: 'https:',
        pageHostname: 'localhost',
      }),
    ).toBe('https://localhost:8081');
  });

  it('falls back to the default dev port when the configured URL is malformed', () => {
    expect(
      resolveApiHttpBase({
        isDev: true,
        configuredUrl: 'not-a-url',
        pageProtocol: 'https:',
        pageHostname: 'localhost',
      }),
    ).toBe('https://localhost:8081');
  });

  it('falls back to the default dev port when the configured URL has no explicit port', () => {
    expect(
      resolveApiHttpBase({
        isDev: true,
        configuredUrl: 'https://api.example.com',
        pageProtocol: 'http:',
        pageHostname: 'localhost',
      }),
    ).toBe('http://localhost:8081');
  });
});
