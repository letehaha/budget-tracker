import { describe, expect, it, vi } from 'vitest';

import { getServiceLogoUrl } from './logo-url';

vi.stubEnv('VITE_LOGO_DEV_TOKEN', 'test-token');

describe('getServiceLogoUrl', () => {
  it('builds a logo.dev URL with the configured token and the given domain', () => {
    const url = getServiceLogoUrl({ domain: 'netflix.com' });

    expect(url).toContain('https://img.logo.dev/netflix.com');
    expect(url).toContain('token=test-token');
    expect(url).toContain('format=png');
  });

  it('returns null when VITE_LOGO_DEV_TOKEN is missing', () => {
    vi.stubEnv('VITE_LOGO_DEV_TOKEN', '');

    const url = getServiceLogoUrl({ domain: 'netflix.com' });

    expect(url).toBeNull();

    vi.stubEnv('VITE_LOGO_DEV_TOKEN', 'test-token');
  });
});
