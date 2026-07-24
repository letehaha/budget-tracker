import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('searchBrands', () => {
  const originalSecretKey = process.env.LOGO_DEV_SECRET_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.LOGO_DEV_SECRET_KEY = 'test-logo-dev-secret-key';
  });

  afterEach(() => {
    process.env.LOGO_DEV_SECRET_KEY = originalSecretKey;
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it('returns an empty array when the upstream request times out', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    global.fetch = jest.fn(() => Promise.reject(abortError)) as unknown as typeof fetch;

    const { searchBrands } = await import('./brand-logo-provider');

    await expect(searchBrands({ query: 'nike' })).resolves.toEqual([]);
  });
});
