import { afterEach, describe, expect, it } from '@jest/globals';

import { getStripeClient } from './client';

describe('getStripeClient', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('builds a live client, which requires every live price id to be filled', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_key';
    process.env.STRIPE_ENV = 'live';
    process.env.AUTH_ORIGIN = 'https://moneymatter.app';
    delete process.env.IS_SELF_HOST;

    expect(() => getStripeClient()).not.toThrow();
  });

  it('refuses live mode without AUTH_ORIGIN', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_other';
    process.env.STRIPE_ENV = 'live';
    delete process.env.AUTH_ORIGIN;
    delete process.env.IS_SELF_HOST;

    expect(() => getStripeClient()).toThrow(/AUTH_ORIGIN/);
  });
});
