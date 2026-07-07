import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addDays, addMonths, format, subDays } from 'date-fns';

/** Returns a date string N months from today on the given day-of-month. */
function futureDate({ monthsAhead, day }: { monthsAhead: number; day: number }): string {
  const d = addMonths(new Date(), monthsAhead);
  d.setDate(day);
  return format(d, 'yyyy-MM-dd');
}

/** Returns a YYYY-MM-DD string N days from today (negative for the past). */
function daysFromToday(days: number): string {
  return format(days >= 0 ? addDays(new Date(), days) : subDays(new Date(), -days), 'yyyy-MM-dd');
}

const indexOfId = (list: Array<{ id: string }>, id: string): number => list.findIndex((s) => s.id === id);

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

describe('GET /subscriptions — nextDueDate field & sorting', () => {
  it('exposes a non-null nextDueDate for a detection-only subscription (no open period)', async () => {
    // No dueDate → no period generated. startDate 26 days ago → derived next
    // date (startDate + 1 month) lands a few days from now.
    const sub = await helpers.createSubscription({
      name: 'Spotify Detection',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: daysFromToday(-26),
      expectedAmount: 9.99,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const list = await helpers.getSubscriptions({ raw: true });
    const found = list.find((s: { id: string }) => s.id === sub.id);

    expect(found).toBeDefined();
    expect(found!.currentPeriod).toBeNull();
    expect(found!.nextDueDate).not.toBeNull();
    // Derived date must be in the near future (within the coming days), not far off.
    expect(found!.nextDueDate! > daysFromToday(-1)).toBe(true);
    expect(found!.nextDueDate! < daysFromToday(15)).toBe(true);
  });

  it('mirrors currentPeriod.dueDate as nextDueDate when an open period exists', async () => {
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

    expect(found!.currentPeriod).not.toBeNull();
    expect(found!.nextDueDate).toBe(found!.currentPeriod!.dueDate);
    expect(found!.nextDueDate).toBe(dueDate);
  });

  it('sortBy=dueDate: a soon detection-only sub sorts before a far-future annual bill (the reported bug)', async () => {
    // Annual bill whose open period is ~287 days out.
    const annualDue = daysFromToday(287);
    const annual = await helpers.createSubscription({
      name: 'Annual Insurance',
      frequency: SUBSCRIPTION_FREQUENCIES.annual,
      startDate: annualDue,
      dueDate: annualDue,
      expectedAmount: 500,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    // Monthly sub with NO open period, but a derived next date only days away.
    const soon = await helpers.createSubscription({
      name: 'Monthly Detection',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: daysFromToday(-26),
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const list = await helpers.getSubscriptions({ sortBy: 'dueDate', raw: true });

    const soonIdx = indexOfId(list, soon.id);
    const annualIdx = indexOfId(list, annual.id);
    expect(soonIdx).toBeGreaterThanOrEqual(0);
    expect(annualIdx).toBeGreaterThanOrEqual(0);
    // Before the fix the far-future annual (which HAD a period) outranked the
    // soon detection-only sub (which had no period → no due date at all).
    expect(soonIdx).toBeLessThan(annualIdx);
  });

  it('sortBy=amount: higher expectedAmount comes first', async () => {
    const dueDate = futureDate({ monthsAhead: 1, day: 5 });
    const cheap = await helpers.createSubscription({
      name: 'Cheap',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      expectedAmount: 5,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });
    const pricey = await helpers.createSubscription({
      name: 'Pricey',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      expectedAmount: 100,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const list = await helpers.getSubscriptions({ sortBy: 'amount', raw: true });
    expect(indexOfId(list, pricey.id)).toBeLessThan(indexOfId(list, cheap.id));
  });

  it('sortBy=name: ascending alphabetical order', async () => {
    const dueDate = futureDate({ monthsAhead: 1, day: 5 });
    const zed = await helpers.createSubscription({
      name: 'Zed Service',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      expectedAmount: 5,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });
    const apple = await helpers.createSubscription({
      name: 'Apple Service',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      expectedAmount: 5,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const list = await helpers.getSubscriptions({ sortBy: 'name', raw: true });
    expect(indexOfId(list, apple.id)).toBeLessThan(indexOfId(list, zed.id));
  });

  it('sortBy=recent: newest createdAt first', async () => {
    const dueDate = futureDate({ monthsAhead: 1, day: 5 });
    const older = await helpers.createSubscription({
      name: 'Older',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      expectedAmount: 5,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });
    const newer = await helpers.createSubscription({
      name: 'Newer',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      expectedAmount: 5,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const list = await helpers.getSubscriptions({ sortBy: 'recent', raw: true });
    expect(indexOfId(list, newer.id)).toBeLessThan(indexOfId(list, older.id));
  });
});
