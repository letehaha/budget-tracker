import { API_ERROR_CODES, FEATURES, FIRE_LIMITS, FIRE_MAX_EXCLUDED_CATEGORIES, PLANS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import UserSettings from '@models/user-settings.model';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';
import { randomUUID } from 'crypto';

const DAY = 24 * 60 * 60 * 1000;

const storeFire = () => helpers.patchUserSettings({ raw: true, patch: { fire: { withdrawalRatePct: 4 } } });

describe('FIRE settings slice', () => {
  it('stores only the patched field under fire', async () => {
    await helpers.patchUserSettings({ raw: true, patch: { fire: { birthYear: 1990 } } });

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.fire).toStrictEqual({ birthYear: 1990 });
  });

  it('clears a field with null and keeps its siblings', async () => {
    await helpers.patchUserSettings({
      raw: true,
      patch: { fire: { annualSpendingOverride: 36000, withdrawalRatePct: 3.5, includeLoans: true } },
    });

    await helpers.patchUserSettings({ raw: true, patch: { fire: { annualSpendingOverride: null } } });

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.fire).toStrictEqual({ annualSpendingOverride: null, withdrawalRatePct: 3.5, includeLoans: true });
  });

  it('rejects out-of-range values and keeps the stored slice', async () => {
    await helpers.patchUserSettings({ raw: true, patch: { fire: { withdrawalRatePct: 4 } } });

    const invalidPatches = [
      { fire: { withdrawalRatePct: 0 } },
      { fire: { leanMultiplier: 1.2 } },
      {
        fire: {
          spendingExcludedCategoryIds: Array.from({ length: FIRE_MAX_EXCLUDED_CATEGORIES + 1 }, () => randomUUID()),
        },
      },
      { fire: { spendingExcludedCategoryIds: ['not-a-uuid'] } },
      { fire: { birthYear: 1990.5 } },
      { fire: { annualSpendingOverride: -1 } },
      { fire: { customReturnPct: FIRE_LIMITS.customReturnPct.max + 1 } },
      { fire: { returnIndicatorId: 'x'.repeat(65) } },
    ];
    for (const patch of invalidPatches) {
      const response = await helpers.patchUserSettings({ patch });
      expect({ patch, statusCode: response.statusCode }).toStrictEqual({
        patch,
        statusCode: ERROR_CODES.ValidationError,
      });
    }

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.fire).toStrictEqual({ withdrawalRatePct: 4 });
  });

  it('patches other slices when the stored fire holds a value outside the current limits', async () => {
    await storeFire();
    const { id: userId } = await helpers.getUserInfo({ raw: true });
    // No endpoint writes an out-of-range fire, so a limit tightened after the save is simulated in the DB.
    const row = await UserSettings.findOne({ where: { userId } });
    await row!.update({ settings: { ...row!.settings, fire: { withdrawalRatePct: 99 } } });

    const response = await helpers.patchUserSettings({ patch: { locale: 'uk' } });
    expect(response.statusCode).toBe(200);

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.locale).toBe('uk');
    expect(fetched.fire).toStrictEqual({ withdrawalRatePct: 99 });
  });

  it('saves the target type and keeps the other fire keys', async () => {
    await helpers.patchUserSettings({ raw: true, patch: { fire: { withdrawalRatePct: 3.5, birthYear: 1990 } } });

    await helpers.patchUserSettings({ raw: true, patch: { fire: { targetType: 'lean' } } });

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.fire).toStrictEqual({ withdrawalRatePct: 3.5, birthYear: 1990, targetType: 'lean' });
  });

  it('rejects an unknown target type and changes nothing', async () => {
    await helpers.patchUserSettings({ raw: true, patch: { fire: { targetType: 'fat' } } });
    const before = await helpers.getUserSettings({ raw: true });

    for (const targetType of ['coast', 'x']) {
      const response = await helpers.patchUserSettings({ patch: { locale: 'uk', fire: { targetType } } });
      expect({ targetType, statusCode: response.statusCode }).toStrictEqual({
        targetType,
        statusCode: ERROR_CODES.ValidationError,
      });
    }

    expect(await helpers.getUserSettings({ raw: true })).toStrictEqual(before);
  });

  it('leaves dashboard widgets untouched', async () => {
    const widgets = [
      { widgetId: 'balance-trend', colSpan: 2, rowSpan: 1 },
      { widgetId: 'subscriptions-overview', colSpan: 1, rowSpan: 1 },
    ];
    await helpers.patchUserSettings({ raw: true, patch: { dashboard: { widgets } } });

    await helpers.patchUserSettings({ raw: true, patch: { fire: { coastTargetAge: 60 } } });

    const fetched = await helpers.getUserSettings({ raw: true });
    expect(fetched.dashboard?.widgets).toStrictEqual(widgets);
    expect(fetched.fire).toStrictEqual({ coastTargetAge: 60 });
  });

  it('converts the override amounts when the base currency changes', async () => {
    await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

    await helpers.patchUserSettings({
      raw: true,
      patch: {
        fire: {
          annualSpendingOverride: 36000,
          monthlyContributionOverride: -1200,
          baristaMonthlyIncome: 800,
          withdrawalRatePct: 3.5,
        },
      },
    });

    const status = await helpers.changeBaseCurrencyAndWait({ newCurrencyCode: 'USD' });
    helpers.expectBaseCurrencyChangeCompleted(status);

    const [oldBaseToUsd] = await helpers.getCurrenciesRates({ codes: [global.BASE_CURRENCY_CODE] });
    const rate = Number(oldBaseToUsd!.rate);
    const convert = ({ amount }: { amount: number }) => Math.round(amount * rate * 100) / 100;

    const { fire } = await helpers.getUserSettings({ raw: true });
    expect(fire?.annualSpendingOverride).toBeCloseTo(convert({ amount: 36000 }), 2);
    expect(fire?.monthlyContributionOverride).toBeCloseTo(convert({ amount: -1200 }), 2);
    expect(fire?.baristaMonthlyIncome).toBeCloseTo(convert({ amount: 800 }), 2);
    expect(fire?.annualSpendingOverride).not.toBe(36000);
    expect(fire?.withdrawalRatePct).toBe(3.5);
  }, 30000);

  it('keeps a cleared override null and converts the set one when the base currency changes', async () => {
    await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
    await helpers.patchUserSettings({
      raw: true,
      patch: { fire: { annualSpendingOverride: null, baristaMonthlyIncome: 800 } },
    });

    const status = await helpers.changeBaseCurrencyAndWait({ newCurrencyCode: 'USD' });
    helpers.expectBaseCurrencyChangeCompleted(status);

    const [oldBaseToUsd] = await helpers.getCurrenciesRates({ codes: [global.BASE_CURRENCY_CODE] });
    const { fire } = await helpers.getUserSettings({ raw: true });
    expect(fire?.annualSpendingOverride).toBeNull();
    expect(fire?.baristaMonthlyIncome).toBeCloseTo(Math.round(800 * Number(oldBaseToUsd!.rate) * 100) / 100, 2);
  }, 30000);

  describe('plan gating', () => {
    it.each([
      { label: 'an essential plan', billing: { plan: PLANS.essential } },
      { label: 'an ended account trial', billing: { trialEndsAt: new Date(Date.now() - DAY) } },
    ])('rejects a fire patch with 402 for $label and keeps the stored slice', async ({ billing }) => {
      await storeFire();
      await helpers.setUserBilling(billing);

      const response = await helpers.patchUserSettings({ patch: { fire: { withdrawalRatePct: 5 } } });
      expect(response.statusCode).toBe(ERROR_CODES.PaymentRequired);
      expect((response.body.response as unknown as ErrorResponse).code).toBe(API_ERROR_CODES.planRequired);

      expect((await helpers.getUserSettings({ raw: true })).fire).toStrictEqual({ withdrawalRatePct: 4 });
    });

    it('still patches other slices for a user without the feature', async () => {
      await helpers.setUserBilling({ plan: PLANS.essential });

      const response = await helpers.patchUserSettings({ patch: { locale: 'uk' } });
      expect(response.statusCode).toBe(200);
      expect((await helpers.getUserSettings({ raw: true })).locale).toBe('uk');
    });

    it.each([
      { label: 'without the feature', billing: { plan: PLANS.essential } },
      { label: 'on the plus plan', billing: { plan: PLANS.plus } },
    ])('ignores fire on PUT for a user $label', async ({ billing }) => {
      await storeFire();
      await helpers.setUserBilling(billing);

      const response = await helpers.updateUserSettings({
        settings: { locale: 'uk', fire: { withdrawalRatePct: 5, birthYear: 1990 } },
      });
      expect(response.statusCode).toBe(200);

      const fetched = await helpers.getUserSettings({ raw: true });
      expect(fetched.locale).toBe('uk');
      expect(fetched.fire).toStrictEqual({ withdrawalRatePct: 4 });
    });

    it('rejects a fire patch with 402 once the FIRE planner trial has elapsed', async () => {
      await helpers.setUserBilling({ plan: PLANS.essential });
      const { id: userId } = await helpers.getUserInfo({ raw: true });
      await helpers.startFeatureTrial({ feature: FEATURES.fire_planner, raw: true });
      await helpers.backdateFeatureTrial({ userId, feature: FEATURES.fire_planner });

      const response = await helpers.patchUserSettings({ patch: { fire: { withdrawalRatePct: 5 } } });
      expect(response.statusCode).toBe(ERROR_CODES.PaymentRequired);
      expect((response.body.response as unknown as ErrorResponse).code).toBe(API_ERROR_CODES.planRequired);
      expect((await helpers.getUserSettings({ raw: true })).fire).toBeUndefined();
    });

    it('accepts a fire patch during an active FIRE planner trial', async () => {
      await helpers.setUserBilling({ plan: PLANS.essential });
      await helpers.startFeatureTrial({ feature: FEATURES.fire_planner, raw: true });

      const response = await helpers.patchUserSettings({ patch: { fire: { withdrawalRatePct: 5 } } });
      expect(response.statusCode).toBe(200);
      expect((await helpers.getUserSettings({ raw: true })).fire).toStrictEqual({ withdrawalRatePct: 5 });
    });

    it('accepts a fire patch on the plus plan', async () => {
      await helpers.setUserBilling({ plan: PLANS.plus });

      const patched = await helpers.patchUserSettings({ patch: { fire: { withdrawalRatePct: 5 } } });
      expect(patched.statusCode).toBe(200);
      expect((await helpers.getUserSettings({ raw: true })).fire).toStrictEqual({ withdrawalRatePct: 5 });
    });
  });
});
