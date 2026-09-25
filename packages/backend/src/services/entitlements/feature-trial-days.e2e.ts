import { FEATURES, FEATURE_TRIAL_DAYS, PLANS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

const DAY = 24 * 60 * 60 * 1000;
const feature = FEATURES.fire_planner;

const getEntitlements = async () => (await helpers.getUserInfo({ raw: true })).entitlements!;
const start = () => helpers.startFeatureTrial({ feature, raw: true });

describe('Day-based feature trials (POST /user/feature-trials/:feature)', () => {
  it('starts a 14-day trial for an essential user', async () => {
    await helpers.setUserBilling({ plan: PLANS.essential });

    const before = await getEntitlements();
    expect(before.features).not.toContain(feature);
    expect(before.featureTrials).toEqual({});

    const entitlements = await start();
    const trial = entitlements.featureTrials[feature]!;

    expect(entitlements.features).toContain(feature);
    expect(new Date(trial.endsAt).getTime() - new Date(trial.startedAt).getTime()).toBe(
      FEATURE_TRIAL_DAYS[feature] * DAY,
    );
    expect((await getEntitlements()).featureTrials).toEqual(entitlements.featureTrials);
  });

  it('keeps the original start date on a repeated call', async () => {
    await helpers.setUserBilling({ plan: PLANS.essential });

    const first = await start();
    const second = await start();

    expect(second.featureTrials[feature]!.startedAt).toBe(first.featureTrials[feature]!.startedAt);
  });

  it('gives an early adopter the same trial', async () => {
    await helpers.setUserBilling({ plan: PLANS.early_adopter });
    expect((await getEntitlements()).features).not.toContain(feature);

    const entitlements = await start();

    expect(entitlements.features).toContain(feature);
    expect(entitlements.featureTrials[feature]).toBeDefined();
  });

  it('records nothing for a plus user who already holds the feature', async () => {
    await helpers.setUserBilling({ plan: PLANS.plus });

    const entitlements = await start();

    expect(entitlements.features).toContain(feature);
    expect(entitlements.featureTrials).toEqual({});

    await helpers.setUserBilling({ plan: PLANS.essential });
    expect((await getEntitlements()).featureTrials).toEqual({});
  });

  it('drops the feature once the trial has elapsed', async () => {
    await helpers.setUserBilling({ plan: PLANS.essential });
    const { id: userId } = await helpers.getUserInfo({ raw: true });
    await start();
    await helpers.backdateFeatureTrial({ userId, feature });

    const entitlements = await getEntitlements();
    expect(entitlements.features).not.toContain(feature);
    expect(entitlements.featureTrials[feature]).toBeDefined();

    const restarted = await start();
    expect(restarted.features).not.toContain(feature);
    expect(restarted.featureTrials[feature]!.startedAt).toBe(entitlements.featureTrials[feature]!.startedAt);
  });

  it('rejects a feature that has no day-based trial with 422', async () => {
    await helpers.setUserBilling({ plan: PLANS.essential });

    expect((await helpers.startFeatureTrial({ feature: FEATURES.invoice_matching })).statusCode).toBe(422);
    expect((await helpers.startFeatureTrial({ feature: 'unknown' })).statusCode).toBe(422);
  });

  it('does not grant a started trial to a read-only account', async () => {
    await helpers.setUserBilling({ plan: PLANS.essential });
    await start();

    await helpers.setUserBilling({ plan: null, trialEndsAt: new Date(Date.now() - DAY) });

    const entitlements = await getEntitlements();
    expect(entitlements.readOnly).toBe(true);
    expect(entitlements.features).not.toContain(feature);
    expect((await helpers.startFeatureTrial({ feature })).statusCode).toBe(402);
  });
});
