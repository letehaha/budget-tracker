import { describe, expect, it, vi } from 'vitest';

// Controls what auth-client sees as the resolved API base. Exposed via a
// getter so each vi.resetModules() re-import of auth-client reads the value
// set by the current test, not the value at mock-hoisting time.
let mockApiHttp = '';
vi.mock('@/api/api-base-url', () => ({
  get API_HTTP() {
    return mockApiHttp;
  },
  API_VER: '/api/v1',
}));

// auth-client pulls in the full i18n module only for getCurrentLocale; stub it
// so the spec doesn't boot the entire i18n setup.
vi.mock('@/i18n', () => ({ getCurrentLocale: () => 'en' }));

describe('getBaseURL', () => {
  it('prefixes window.location.origin when the API base is empty (same-origin mode)', async () => {
    // Same-origin deployments resolve API_HTTP to '' so regular fetches use
    // relative URLs — but better-auth's createAuthClient requires an ABSOLUTE
    // baseURL and throws "Invalid base URL" on a relative one, crashing the
    // app at module load.
    mockApiHttp = '';
    vi.resetModules();

    const { getBaseURL } = await import('./auth-client');

    expect(getBaseURL()).toBe(`${window.location.origin}/api/v1/auth`);
  });

  it('keeps the configured absolute URL when the API base is set', async () => {
    mockApiHttp = 'https://api.example.com';
    vi.resetModules();

    const { getBaseURL } = await import('./auth-client');

    expect(getBaseURL()).toBe('https://api.example.com/api/v1/auth');
  });
});
