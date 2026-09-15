import { API_ERROR_CODES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Users from '@models/users.model';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';
import { clearMockSession, registerMockSession } from '@tests/mocks/better-auth';

describe('Billing checkout in demo mode', () => {
  it('refuses to start a checkout for a demo session', async () => {
    const demo = await helpers.makeAuthRequest({ method: 'post', url: '/demo' });
    expect(demo.statusCode).toBe(200);

    const cookies = helpers.extractCookies(demo);
    const sessionToken = cookies.match(/bt_auth\.session_token=([^;]+)/)?.[1];
    const demoUser = await Users.findByPk(demo.body.response.user.id);
    registerMockSession(sessionToken!, { id: demoUser!.authUserId, email: `demo-${demoUser!.id}@demo.local` });

    try {
      const checkout = await helpers.asUser({
        cookies,
        fn: () => helpers.createBillingCheckout({ payload: { tier: 'plus', cycle: 'month' } }),
      });

      expect(checkout.statusCode).toBe(403);
      expect((checkout.body.response as unknown as ErrorResponse).code).toBe(API_ERROR_CODES.forbidden);
    } finally {
      clearMockSession(sessionToken!);
    }
  }, 120_000);
});
