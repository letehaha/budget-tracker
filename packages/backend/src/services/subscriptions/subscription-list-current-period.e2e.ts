import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addMonths, format } from 'date-fns';

/** Returns a date string N months from today on the given day-of-month. */
function futureDate({ monthsAhead, day }: { monthsAhead: number; day: number }): string {
  const d = addMonths(new Date(), monthsAhead);
  d.setDate(day);
  return format(d, 'yyyy-MM-dd');
}

describe('GET /subscriptions — currentPeriod field', () => {
  it('is non-null with status=upcoming for a scheduled subscription', async () => {
    const dueDate = futureDate({ monthsAhead: 1, day: 10 });
    const sub = await helpers.createSubscription({
      name: 'Netflix',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      expectedAmount: 15.99,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const list = await helpers.getSubscriptions({ raw: true });
    const found = list.find((s: { id: string }) => s.id === sub.id);

    expect(found).toBeDefined();
    expect(found!.currentPeriod).not.toBeNull();
    expect(found!.currentPeriod!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);
    expect(found!.currentPeriod!.dueDate).toBe(dueDate);
    expect(found!.currentPeriod!.id).toBeTruthy();
  });

  it('is null for a detection-only subscription (no dueDate)', async () => {
    const sub = await helpers.createSubscription({
      name: 'Spotify Detection',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: '2025-01-01',
      // No dueDate — detection-only, no periods generated.
      expectedAmount: 9.99,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const list = await helpers.getSubscriptions({ raw: true });
    const found = list.find((s: { id: string }) => s.id === sub.id);

    expect(found).toBeDefined();
    expect(found!.currentPeriod).toBeNull();
  });

  it('points at the next upcoming period after the first period is paid', async () => {
    const firstDueDate = futureDate({ monthsAhead: 1, day: 15 });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 5000 }),
      raw: true,
    });

    const sub = await helpers.createSubscription({
      name: 'iCloud',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: firstDueDate,
      dueDate: firstDueDate,
      accountId: account.id,
      expectedAmount: 2.99,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    // Fetch the detail to obtain the first upcoming period's id.
    const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    const firstPeriod = detail.periods.find(
      (p: { status: string }) => p.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming,
    );
    expect(firstPeriod).toBeDefined();

    // Pay the first period via create-mode so ensure-next-period fires and
    // generates the following month's period automatically.
    await helpers.markSubscriptionPeriodPaid({
      id: sub.id,
      periodId: firstPeriod!.id,
      createTransaction: true,
      amount: 2.99,
      time: new Date().toISOString(),
      raw: true,
    });

    // The list must now expose the second period (next month), not the paid one.
    const list = await helpers.getSubscriptions({ raw: true });
    const found = list.find((s: { id: string }) => s.id === sub.id);

    expect(found).toBeDefined();
    expect(found!.currentPeriod).not.toBeNull();
    expect(found!.currentPeriod!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);

    // The new period's dueDate must be one month after the first.
    const expectedNext = format(addMonths(new Date(firstDueDate + 'T00:00:00Z'), 1), 'yyyy-MM-dd');
    expect(found!.currentPeriod!.dueDate).toBe(expectedNext);

    // The paid period's id must not appear as the currentPeriod.
    expect(found!.currentPeriod!.id).not.toBe(firstPeriod!.id);
  });
});
