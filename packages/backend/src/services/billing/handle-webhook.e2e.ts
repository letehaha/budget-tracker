import { FEATURES, PLAN_FEATURES, SEATS_BY_PLAN, STRIPE_PRICE_IDS, SUBSCRIPTION_STATUSES } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import BillingSubscriptions from '@models/billing-subscriptions.model';
import * as helpers from '@tests/helpers';
import { HttpResponse, http } from 'msw';

const DAY = 24 * 60 * 60 * 1000;

const getCurrentUserId = async () => (await helpers.getUserInfo({ raw: true })).id;
const getEntitlements = async () => (await helpers.getUserInfo({ raw: true })).entitlements!;

describe('Stripe billing webhook (POST /webhooks/billing)', () => {
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  describe('signature verification', () => {
    it('rejects a payload signed with the wrong secret', async () => {
      const res = await helpers.sendBillingWebhook({
        payload: helpers.buildStripeSubscriptionEvent(),
        secret: 'whsec_not_the_secret',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a timestamp outside the allowed tolerance', async () => {
      const res = await helpers.sendBillingWebhook({
        payload: helpers.buildStripeSubscriptionEvent(),
        timestamp: Math.floor(Date.now() / 1000) - 10 * 60,
      });
      expect(res.statusCode).toBe(401);
    });

    it('answers 500 when the webhook secret is not configured', async () => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      try {
        const res = await helpers.sendBillingWebhook({
          payload: helpers.buildStripeSubscriptionEvent(),
        });
        expect(res.statusCode).toBe(500);
      } finally {
        process.env.STRIPE_WEBHOOK_SECRET = secret;
      }
    });
  });

  it('mirrors a created subscription and drives entitlements from its tier', async () => {
    const userId = await getCurrentUserId();
    // Stripe timestamps are whole seconds, so a date with milliseconds never round-trips.
    const currentPeriodEndsAt = new Date(Math.floor((Date.now() + 30 * DAY) / 1000) * 1000);

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        priceId: STRIPE_PRICE_IDS.test.essential.year,
        currentPeriodEndsAt,
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe('processed');

    const row = await BillingSubscriptions.findOne({ where: { userId } });
    expect(row).not.toBeNull();
    expect(row!.tier).toBe('essential');
    expect(row!.billingCycle).toBe('year');
    expect(row!.status).toBe(SUBSCRIPTION_STATUSES.active);
    expect(row!.externalCustomerId).toBe('cus_01test');

    const entitlements = await getEntitlements();
    expect(entitlements.readOnly).toBe(false);
    expect(entitlements.features.toSorted()).toEqual(PLAN_FEATURES.essential.toSorted());
    expect(entitlements.seats).toBe(SEATS_BY_PLAN.essential);
    expect(entitlements.subscriptions).toHaveLength(1);
    expect(entitlements.subscriptions[0]).toMatchObject({
      externalSubscriptionId: 'sub_01test',
      tier: 'essential',
      status: SUBSCRIPTION_STATUSES.active,
      currentPeriodEndsAt: currentPeriodEndsAt.toISOString(),
    });
  });

  it('reports a repeated event id as a duplicate without touching the mirror row', async () => {
    const userId = await getCurrentUserId();
    const payload = helpers.buildStripeSubscriptionEvent({ userId });

    const first = await helpers.sendBillingWebhook({ payload });
    expect(first.body.outcome).toBe('processed');

    const second = await helpers.sendBillingWebhook({ payload });
    expect(second.statusCode).toBe(200);
    expect(second.body.outcome).toBe('duplicate');

    expect(await BillingSubscriptions.count({ where: { userId } })).toBe(1);
  });

  it('drops an event older than the stored provider timestamp', async () => {
    const userId = await getCurrentUserId();
    const createdAt = new Date();

    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        createdAt,
        status: SUBSCRIPTION_STATUSES.active,
      }),
    });

    const stale = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        createdAt: new Date(createdAt.getTime() - DAY),
        status: SUBSCRIPTION_STATUSES.paused,
      }),
    });
    expect(stale.body.outcome).toBe('stale');

    const row = await BillingSubscriptions.findOne({ where: { userId } });
    expect(row!.status).toBe(SUBSCRIPTION_STATUSES.active);
  });

  it('leaves a user with an expired trial read-only after deletion', async () => {
    const userId = await getCurrentUserId();
    await helpers.setUserBilling({ trialEndsAt: new Date(Date.now() - DAY) });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.deleted',
        status: SUBSCRIPTION_STATUSES.canceled,
        currentPeriodEndsAt: new Date(Date.now() - DAY),
      }),
    });
    expect(res.body.outcome).toBe('processed');

    const entitlements = await getEntitlements();
    expect(entitlements.readOnly).toBe(true);
    expect(entitlements.features).toEqual([FEATURES.data_export]);
  });

  it('mirrors unpaid as canceled and withholds entitlement', async () => {
    const userId = await getCurrentUserId();
    await helpers.setUserBilling({ trialEndsAt: new Date(Date.now() - DAY) });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({ userId, status: 'unpaid' }),
    });
    expect(res.body.outcome).toBe('processed');

    const row = await BillingSubscriptions.findOne({ where: { userId } });
    expect(row!.status).toBe(SUBSCRIPTION_STATUSES.canceled);
    expect((await getEntitlements()).readOnly).toBe(true);
  });

  it('ignores an incomplete subscription that has never been paid', async () => {
    const userId = await getCurrentUserId();

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({ userId, status: 'incomplete' }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe('ignored');
    expect(await BillingSubscriptions.count()).toBe(0);
  });

  it('applies the same-second activation that follows the incomplete subscription.created', async () => {
    const userId = await getCurrentUserId();
    const createdAt = new Date();

    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({ userId, createdAt, status: 'incomplete' }),
    });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        createdAt,
        eventType: 'customer.subscription.updated',
        status: SUBSCRIPTION_STATUSES.active,
      }),
    });
    expect(res.body.outcome).toBe('processed');

    expect(await BillingSubscriptions.count({ where: { userId } })).toBe(1);
    const row = await BillingSubscriptions.findOne({ where: { userId } });
    expect(row!.status).toBe(SUBSCRIPTION_STATUSES.active);
    expect((await getEntitlements()).readOnly).toBe(false);
  });

  it('rejects a payload carrying no current period end', async () => {
    const userId = await getCurrentUserId();

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        status: SUBSCRIPTION_STATUSES.active,
        currentPeriodEndsAt: null,
      }),
    });
    expect(res.statusCode).toBe(500);
    expect(res.body.outcome).toBe('failed');
    expect(await BillingSubscriptions.count()).toBe(0);
  });

  it('acknowledges and ignores event types that are not subscription events', async () => {
    const res = await helpers.sendBillingWebhook({
      payload: {
        id: 'evt_invoice_1',
        object: 'event',
        type: 'invoice.paid',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'in_1', object: 'invoice' } },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe('ignored');
  });

  it('fails an event that maps to no user, then processes the retry once the customer is known', async () => {
    const payload = helpers.buildStripeSubscriptionEvent({
      subscriptionId: 'sub_orphan',
      customerId: 'cus_unknown',
    });

    const failed = await helpers.sendBillingWebhook({ payload });
    expect(failed.statusCode).toBe(500);
    expect(failed.body.outcome).toBe('failed');
    expect(await BillingSubscriptions.count()).toBe(0);

    const userId = await getCurrentUserId();
    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        subscriptionId: 'sub_known',
        customerId: 'cus_unknown',
      }),
    });

    const retried = await helpers.sendBillingWebhook({ payload });
    expect(retried.statusCode).toBe(200);
    expect(retried.body.outcome).toBe('processed');
    expect(await BillingSubscriptions.count({ where: { userId } })).toBe(2);
  });

  it('maps an event without metadata to the user who owns that customer id', async () => {
    const userId = await getCurrentUserId();
    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({ userId, customerId: 'cus_shared' }),
    });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        subscriptionId: 'sub_from_dashboard',
        customerId: 'cus_shared',
      }),
    });
    expect(res.body.outcome).toBe('processed');

    const row = await BillingSubscriptions.findOne({ where: { externalSubscriptionId: 'sub_from_dashboard' } });
    expect(row!.userId).toBe(userId);
  });

  it('trusts metadata.userId over the user who owns the customer id', async () => {
    const ownerId = await getCurrentUserId();
    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({ userId: ownerId, customerId: 'cus_shared' }),
    });

    const signup = await helpers.makeAuthRequest({
      method: 'post',
      url: '/auth/sign-up/email',
      payload: { email: `metadata-owner-${Date.now()}@test.local`, password: 'testpassword123', name: 'Other' },
    });
    expect(signup.statusCode).toBe(200);
    const cookies = helpers.extractCookies(signup);
    const { id: otherId } = await helpers.asUser({ cookies, fn: () => helpers.getUserInfo({ raw: true }) });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId: otherId,
        subscriptionId: 'sub_metadata_wins',
        customerId: 'cus_shared',
      }),
    });
    expect(res.body.outcome).toBe('processed');

    const row = await BillingSubscriptions.findOne({ where: { externalSubscriptionId: 'sub_metadata_wins' } });
    expect(row!.userId).toBe(otherId);
    expect(otherId).not.toBe(ownerId);
  });

  it('ignores a deleted event for a customer it never mirrored', async () => {
    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        eventType: 'customer.subscription.deleted',
        status: SUBSCRIPTION_STATUSES.canceled,
        customerId: 'cus_deleted_user',
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe('ignored');
    expect(await BillingSubscriptions.count()).toBe(0);
  });

  it('keeps a past_due subscription entitled while its billing period is still running', async () => {
    const userId = await getCurrentUserId();
    await helpers.setUserBilling({ trialEndsAt: new Date(Date.now() - DAY) });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        status: SUBSCRIPTION_STATUSES.past_due,
        currentPeriodEndsAt: new Date(Date.now() + DAY),
      }),
    });
    expect(res.body.outcome).toBe('processed');

    const entitlements = await getEntitlements();
    expect(entitlements.readOnly).toBe(false);
    expect(entitlements.features.toSorted()).toEqual(PLAN_FEATURES.plus.toSorted());
  });

  it('drops an active subscription whose billing period already ended to read-only', async () => {
    const userId = await getCurrentUserId();
    await helpers.setUserBilling({ trialEndsAt: new Date(Date.now() - DAY) });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        status: SUBSCRIPTION_STATUSES.active,
        currentPeriodEndsAt: new Date(Date.now() - DAY),
      }),
    });
    expect(res.body.outcome).toBe('processed');

    expect((await getEntitlements()).readOnly).toBe(true);
  });

  it('mirrors a scheduled cancellation onto the subscription summary', async () => {
    const userId = await getCurrentUserId();
    const cancelAt = new Date(Math.floor((Date.now() + 15 * DAY) / 1000) * 1000);

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.updated',
        cancelAt,
      }),
    });
    expect(res.body.outcome).toBe('processed');

    const entitlements = await getEntitlements();
    expect(entitlements.subscriptions[0]!.scheduledChange).toEqual({
      action: 'cancel',
      effectiveAt: cancelAt.toISOString(),
    });
  });

  it('mirrors a cancel_at set without cancel_at_period_end, as flexible billing mode sends it', async () => {
    const userId = await getCurrentUserId();
    const cancelAt = new Date(Math.floor((Date.now() + 15 * DAY) / 1000) * 1000);

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.updated',
        cancelAt,
        cancelAtPeriodEnd: false,
      }),
    });
    expect(res.body.outcome).toBe('processed');

    const entitlements = await getEntitlements();
    expect(entitlements.subscriptions[0]!.scheduledChange).toEqual({
      action: 'cancel',
      effectiveAt: cancelAt.toISOString(),
    });
  });

  it('reads cancel_at_period_end without a cancel_at as a cancel at the period end', async () => {
    const userId = await getCurrentUserId();
    const currentPeriodEndsAt = new Date(Math.floor((Date.now() + 20 * DAY) / 1000) * 1000);

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.updated',
        currentPeriodEndsAt,
        cancelAtPeriodEnd: true,
      }),
    });
    expect(res.body.outcome).toBe('processed');

    const entitlements = await getEntitlements();
    expect(entitlements.subscriptions[0]!.scheduledChange).toEqual({
      action: 'cancel',
      effectiveAt: currentPeriodEndsAt.toISOString(),
    });
  });

  it('pauses an active subscription whose collection Stripe paused, and mirrors the resume date', async () => {
    const userId = await getCurrentUserId();
    const resumesAt = new Date(Math.floor((Date.now() + 5 * DAY) / 1000) * 1000);

    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.updated',
        status: SUBSCRIPTION_STATUSES.active,
        pauseCollection: { resumesAt },
      }),
    });

    const entitlements = await getEntitlements();
    expect(entitlements.subscriptions[0]!.status).toBe(SUBSCRIPTION_STATUSES.paused);
    expect(entitlements.subscriptions[0]!.scheduledChange).toEqual({
      action: 'resume',
      effectiveAt: resumesAt.toISOString(),
    });
  });

  it('withholds entitlement while collection is paused with no resume date', async () => {
    const userId = await getCurrentUserId();
    await helpers.setUserBilling({ trialEndsAt: new Date(Date.now() - DAY) });

    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.updated',
        status: SUBSCRIPTION_STATUSES.active,
        pauseCollection: { resumesAt: null },
      }),
    });

    const entitlements = await getEntitlements();
    expect(entitlements.subscriptions[0]!.status).toBe(SUBSCRIPTION_STATUSES.paused);
    expect(entitlements.subscriptions[0]!.scheduledChange).toBeNull();
    expect(entitlements.readOnly).toBe(true);
    expect(entitlements.features).not.toContain(FEATURES.bank_providers);
  });

  it('mirrors a Stripe-reported paused status, which carries no resume date', async () => {
    const userId = await getCurrentUserId();

    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.updated',
        status: SUBSCRIPTION_STATUSES.paused,
      }),
    });

    const entitlements = await getEntitlements();
    expect(entitlements.subscriptions[0]!.status).toBe(SUBSCRIPTION_STATUSES.paused);
    expect(entitlements.subscriptions[0]!.scheduledChange).toBeNull();
  });

  it('updates the existing mirror row in place when a newer event arrives', async () => {
    const userId = await getCurrentUserId();
    const createdAt = new Date();
    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        createdAt,
        priceId: STRIPE_PRICE_IDS.test.essential.month,
        currentPeriodEndsAt: new Date(Math.floor((Date.now() + 10 * DAY) / 1000) * 1000),
      }),
    });

    const nextPeriodEnd = new Date(Math.floor((Date.now() + 40 * DAY) / 1000) * 1000);
    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.updated',
        createdAt: new Date(createdAt.getTime() + 60_000),
        priceId: STRIPE_PRICE_IDS.test.plus.year,
        status: SUBSCRIPTION_STATUSES.past_due,
        currentPeriodEndsAt: nextPeriodEnd,
      }),
    });
    expect(res.body.outcome).toBe('processed');

    expect(await BillingSubscriptions.count({ where: { userId } })).toBe(1);
    const row = await BillingSubscriptions.findOne({ where: { userId } });
    expect(row!.tier).toBe('plus');
    expect(row!.billingCycle).toBe('year');
    expect(row!.status).toBe(SUBSCRIPTION_STATUSES.past_due);
    expect(row!.currentPeriodEndsAt.toISOString()).toBe(nextPeriodEnd.toISOString());
  });

  it('keeps a same-second out-of-order update from resurrecting a canceled subscription', async () => {
    const userId = await getCurrentUserId();
    const createdAt = new Date();

    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({ userId, createdAt: new Date(createdAt.getTime() - 60_000) }),
    });
    await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        createdAt,
        eventType: 'customer.subscription.deleted',
        status: SUBSCRIPTION_STATUSES.canceled,
      }),
    });

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        createdAt,
        eventType: 'customer.subscription.updated',
        status: SUBSCRIPTION_STATUSES.active,
      }),
    });
    expect(res.body.outcome).toBe('stale');

    const row = await BillingSubscriptions.findOne({ where: { userId } });
    expect(row!.status).toBe(SUBSCRIPTION_STATUSES.canceled);
  });

  it('ignores the cancel echo that arrives after the account was deleted', async () => {
    const userId = await getCurrentUserId();
    await helpers.sendBillingWebhook({ payload: helpers.buildStripeSubscriptionEvent({ userId }) });

    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
    global.mswMockServer.use(
      http.get('https://api.stripe.com/v1/subscriptions/:id', () =>
        HttpResponse.json({ id: 'sub_01test', object: 'subscription', status: 'active' }),
      ),
      http.delete('https://api.stripe.com/v1/subscriptions/:id', () =>
        HttpResponse.json({ id: 'sub_01test', object: 'subscription', status: 'canceled' }),
      ),
    );
    expect((await helpers.deleteUserAccount()).statusCode).toBe(200);

    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        eventType: 'customer.subscription.deleted',
        status: SUBSCRIPTION_STATUSES.canceled,
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe('ignored');
    expect(await BillingSubscriptions.count()).toBe(0);
  });

  it('rejects a payload carrying an unknown price id', async () => {
    const userId = await getCurrentUserId();
    const res = await helpers.sendBillingWebhook({
      payload: helpers.buildStripeSubscriptionEvent({
        userId,
        priceId: 'price_unknown',
      }),
    });
    expect(res.statusCode).toBe(500);
    expect(res.body.outcome).toBe('failed');
    expect(await BillingSubscriptions.count()).toBe(0);
  });

  it('is not exposed on a self-hosted instance', async () => {
    const userId = await getCurrentUserId();
    const res = await helpers.withSelfHost(() =>
      helpers.sendBillingWebhook({
        payload: helpers.buildStripeSubscriptionEvent({ userId }),
      }),
    );
    expect(res.statusCode).toBe(404);
  });
});
