import { describe, expect, it } from 'vitest';

import { FETCH_NETWORK_FAILURE_MESSAGES, NetworkError } from './network.error';

describe('NetworkError', () => {
  it('reports its own name so the Sentry ignore rule can match it', () => {
    expect(new NetworkError('offline').name).toBe('NetworkError');
  });

  it.each([
    ['Chrome', 'Failed to fetch'],
    ['Safari', 'Load failed'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
  ])('%s fetch failure message is recognised', (_browser, message) => {
    expect(FETCH_NETWORK_FAILURE_MESSAGES.some((m) => message.includes(m))).toBe(true);
  });
});
