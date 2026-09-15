import { PLANS, PLAN_FEATURES } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Admin user plan (PATCH /admin/users/:id/plan)', () => {
  let originalAdminUsers: string | undefined;

  beforeEach(() => {
    originalAdminUsers = process.env.ADMIN_USERS;
  });

  afterEach(() => {
    if (originalAdminUsers === undefined) delete process.env.ADMIN_USERS;
    else process.env.ADMIN_USERS = originalAdminUsers;
  });

  it('rejects a non-admin caller', async () => {
    process.env.ADMIN_USERS = 'someone-else';

    const update = await helpers.adminUpdateUserPlan({
      userId: 1,
      payload: { plan: PLANS.plus },
    });
    expect(update.statusCode).toBe(401);
  });

  describe('as an admin', () => {
    beforeEach(() => {
      process.env.ADMIN_USERS = 'test1';
    });

    it('sets a plan that GET /user then reflects', async () => {
      const { id } = await helpers.getUserInfo({ raw: true });

      const updated = await helpers.adminUpdateUserPlan({
        userId: id,
        payload: { plan: PLANS.essential },
        raw: true,
      });
      expect(updated.entitlements.plan).toBe(PLANS.essential);

      const entitlements = (await helpers.getUserInfo({ raw: true })).entitlements!;
      expect(entitlements.plan).toBe(PLANS.essential);
      expect(entitlements.features.toSorted()).toEqual(PLAN_FEATURES.essential.toSorted());
    });

    it('clears the plan with plan: null', async () => {
      const { id } = await helpers.getUserInfo({ raw: true });
      await helpers.adminUpdateUserPlan({ userId: id, payload: { plan: PLANS.plus }, raw: true });

      const cleared = await helpers.adminUpdateUserPlan({ userId: id, payload: { plan: null }, raw: true });
      expect(cleared.entitlements.plan).toBeNull();
    });

    it('sets and clears trialEndsAt', async () => {
      const { id } = await helpers.getUserInfo({ raw: true });
      const trialEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

      const granted = await helpers.adminUpdateUserPlan({
        userId: id,
        payload: { trialEndsAt: trialEndsAt.toISOString() },
        raw: true,
      });
      expect(granted.entitlements.trialEndsAt).toBe(trialEndsAt.toISOString());

      const cleared = await helpers.adminUpdateUserPlan({
        userId: id,
        payload: { trialEndsAt: null },
        raw: true,
      });
      expect(cleared.entitlements.trialEndsAt).toBeNull();
    });

    it('refuses to grant a plan while a live subscription exists', async () => {
      const { id } = await helpers.getUserInfo({ raw: true });
      const webhook = await helpers.sendBillingWebhook({
        payload: helpers.buildStripeSubscriptionEvent({ userId: id }),
      });
      expect(webhook.body.outcome).toBe('processed');

      const res = await helpers.adminUpdateUserPlan({ userId: id, payload: { plan: PLANS.plus } });
      expect(res.statusCode).toBe(409);
    });

    it('returns 404 for an unknown userId', async () => {
      const res = await helpers.adminUpdateUserPlan({ userId: 999999, payload: { plan: PLANS.plus } });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 for an unknown plan', async () => {
      const { id } = await helpers.getUserInfo({ raw: true });

      const res = await helpers.adminUpdateUserPlan({
        userId: id,
        payload: { plan: 'enterprise' as never },
      });
      expect(res.statusCode).toBe(422);
    });
  });
});
