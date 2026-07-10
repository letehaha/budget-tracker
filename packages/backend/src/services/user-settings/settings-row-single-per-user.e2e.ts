import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * One UserSettings row per user, created lazily and shared by every write
 * endpoint. The unique `userId` index + insert-or-adopt keep concurrent
 * first-writes from inserting duplicate rows.
 *
 * Caveat: supertest requests can share one transaction via CLS (see
 * `with-transaction.ts`), so slice-level "no lost update" (a prod-only
 * isolation property) isn't assertable here — only that a losing racer recovers
 * instead of 500-ing.
 */
describe('UserSettings — one row per user', () => {
  it('shares a single lazily-created row across the settings and onboarding endpoints', async () => {
    // Sequential: row created on first write, reused by the other endpoint.
    await helpers.patchUserSettings({ raw: true, patch: { locale: 'uk' } });
    await helpers.updateOnboarding({ raw: true, onboardingState: { isDismissed: true } });

    const settings = await helpers.getUserSettings({ raw: true });
    const onboarding = await helpers.getOnboarding({ raw: true });

    expect(settings.locale).toBe('uk');
    expect(onboarding.isDismissed).toBe(true);
  });

  it('recovers instead of crashing when a settings patch and an onboarding update race on a fresh user', async () => {
    const [patchRes, onboardingRes] = await Promise.all([
      helpers.patchUserSettings({ patch: { locale: 'uk' } }),
      helpers.updateOnboarding({ onboardingState: { isDismissed: true } }),
    ]);

    // A losing racer must adopt the winner's row, not abort the transaction.
    expect(patchRes.statusCode).toBeLessThan(500);
    expect(onboardingRes.statusCode).toBeLessThan(500);

    const settings = await helpers.getUserSettings({ raw: true });
    expect(settings.locale).toBeDefined();
  });

  it('recovers instead of crashing when two settings patches race on a fresh user', async () => {
    const [first, second] = await Promise.all([
      helpers.patchUserSettings({ patch: { locale: 'uk' } }),
      helpers.patchUserSettings({ patch: { includeCreditLimitInStats: true } }),
    ]);

    expect(first.statusCode).toBeLessThan(500);
    expect(second.statusCode).toBeLessThan(500);

    const settings = await helpers.getUserSettings({ raw: true });
    expect(settings.locale).toBeDefined();
  });
});
