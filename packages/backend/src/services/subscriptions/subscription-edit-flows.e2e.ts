import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_PERIOD_STATUSES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays, addMonths, format, subDays } from 'date-fns';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Date string N months from today; optionally pinned to a day-of-month. */
function futureDate({ monthsAhead, day }: { monthsAhead: number; day?: number }): string {
  const d = addMonths(new Date(), monthsAhead);
  if (day !== undefined) d.setDate(day);
  return format(d, 'yyyy-MM-dd');
}

/** Date string N days before today. */
function pastDateDays({ daysAgo }: { daysAgo: number }): string {
  return format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
}

/** Date string N months in the past, on the given day-of-month. */
function pastDateMonths({ monthsAgo, day }: { monthsAgo: number; day: number }): string {
  const d = addMonths(new Date(), -monthsAgo);
  d.setDate(day);
  return format(d, 'yyyy-MM-dd');
}

const OPEN = [SUBSCRIPTION_PERIOD_STATUSES.upcoming, SUBSCRIPTION_PERIOD_STATUSES.overdue];
const isOpen = (p: { status: string }) => OPEN.includes(p.status as (typeof OPEN)[number]);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** A monthly subscription with an account + amount so create-mode pay works. */
async function createMonthlySub({
  dueDate,
  frequency = SUBSCRIPTION_FREQUENCIES.monthly,
  amount = 20,
}: {
  dueDate: string;
  frequency?: SUBSCRIPTION_FREQUENCIES;
  amount?: number;
}) {
  const account = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
    raw: true,
  });
  const sub = await helpers.createSubscription({
    name: 'Recurring',
    frequency,
    startDate: dueDate,
    dueDate,
    accountId: account.id,
    categoryId: global.DEFAULT_CATEGORY_ID,
    expectedAmount: amount,
    expectedCurrencyCode: global.BASE_CURRENCY.code,
    raw: true,
  });
  return { account, sub };
}

/** A monthly installment with an account + amount and a payment count. */
async function createInstallment({
  maxOccurrences,
  monthsAhead = 1,
  day,
}: {
  maxOccurrences: number;
  monthsAhead?: number;
  day?: number;
}) {
  const account = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
    raw: true,
  });
  const dueDate = futureDate({ monthsAhead, day });
  const sub = await helpers.createSubscription({
    name: 'Installment plan',
    type: SUBSCRIPTION_TYPES.installment,
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: dueDate,
    dueDate,
    accountId: account.id,
    categoryId: global.DEFAULT_CATEGORY_ID,
    expectedAmount: 10,
    expectedCurrencyCode: global.BASE_CURRENCY.code,
    maxOccurrences,
    raw: true,
  });
  return { account, sub, dueDate };
}

async function getOpenPeriods({ subId }: { subId: string }) {
  const detail = await helpers.getSubscriptionById({ id: subId, raw: true });
  return detail.periods.filter(isOpen);
}

async function getOpenPeriod({ subId }: { subId: string }) {
  return (await getOpenPeriods({ subId }))[0] ?? null;
}

// ===========================================================================
// Rescheduling: editing dueDate must move the live open period
// ===========================================================================

describe('Edit dueDate moves the existing open period', () => {
  it('shifts the single open period onto the new date and reflects it on the list', async () => {
    const d1 = futureDate({ monthsAhead: 1, day: 10 });
    const { sub } = await createMonthlySub({ dueDate: d1 });

    const openBefore = await getOpenPeriod({ subId: sub.id });
    expect(openBefore!.dueDate).toBe(d1);

    const d2 = futureDate({ monthsAhead: 2, day: 20 });
    await helpers.updateSubscription({ id: sub.id, dueDate: d2, raw: true });

    const openAfter = await getOpenPeriods({ subId: sub.id });
    // Still exactly one open period — moved in place, not duplicated.
    expect(openAfter).toHaveLength(1);
    expect(openAfter[0]!.id).toBe(openBefore!.id);
    expect(openAfter[0]!.dueDate).toBe(d2);

    // The list's "due in N days" chip tracks the new date.
    const list = await helpers.getSubscriptions({ raw: true });
    const item = list.find((s) => s.id === sub.id);
    expect(item!.currentPeriod!.dueDate).toBe(d2);
  });

  it('re-resolves the moved period to overdue when the new date is in the past', async () => {
    const d1 = futureDate({ monthsAhead: 1, day: 10 });
    const { sub } = await createMonthlySub({ dueDate: d1 });
    expect((await getOpenPeriod({ subId: sub.id }))!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);

    const past = pastDateDays({ daysAgo: 3 });
    await helpers.updateSubscription({ id: sub.id, dueDate: past, raw: true });

    const open = await getOpenPeriod({ subId: sub.id });
    expect(open!.dueDate).toBe(past);
    expect(open!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);
  });

  it('re-resolves an overdue period to upcoming when rescheduled to the future', async () => {
    const past = pastDateDays({ daysAgo: 2 });
    const { sub } = await createMonthlySub({ dueDate: past });
    expect((await getOpenPeriod({ subId: sub.id }))!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);

    const future = futureDate({ monthsAhead: 1, day: 15 });
    await helpers.updateSubscription({ id: sub.id, dueDate: future, raw: true });

    const open = await getOpenPeriod({ subId: sub.id });
    expect(open!.dueDate).toBe(future);
    expect(open!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);
  });

  it('anchors the next generated period off the edited date (weekly)', async () => {
    const d1 = futureDate({ monthsAhead: 1, day: 7 });
    const { sub } = await createMonthlySub({ dueDate: d1, frequency: SUBSCRIPTION_FREQUENCIES.weekly });

    const d2 = futureDate({ monthsAhead: 1, day: 21 });
    await helpers.updateSubscription({ id: sub.id, dueDate: d2, raw: true });

    const moved = await getOpenPeriod({ subId: sub.id });
    expect(moved!.dueDate).toBe(d2);

    // Paying the moved period must generate the next one a week after the NEW date.
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: moved!.id, createTransaction: true, raw: true });

    const next = await getOpenPeriod({ subId: sub.id });
    const expectedNext = format(addDays(new Date(d2 + 'T00:00:00Z'), 7), 'yyyy-MM-dd');
    expect(next!.dueDate).toBe(expectedNext);
  });

  it('leaves a paid period untouched and only moves the open one (installment)', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 3, monthsAhead: 1, day: 5 });

    const p1 = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p1!.id, createTransaction: true, raw: true });
    const paidDate = p1!.dueDate;

    const openP2 = await getOpenPeriod({ subId: sub.id });
    const newDate = futureDate({ monthsAhead: 5, day: 12 });

    // Re-send the full installment payload (as the edit form does), changing only the date.
    await helpers.updateSubscription({
      id: sub.id,
      type: SUBSCRIPTION_TYPES.installment,
      maxOccurrences: 3,
      dueDate: newDate,
      raw: true,
    });

    const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    // The paid period keeps its original date.
    const paid = detail.periods.filter((p) => p.status === SUBSCRIPTION_PERIOD_STATUSES.paid);
    expect(paid).toHaveLength(1);
    expect(paid[0]!.dueDate).toBe(paidDate);
    // The open period (and only it) moved to the new date.
    const open = detail.periods.filter(isOpen);
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(openP2!.id);
    expect(open[0]!.dueDate).toBe(newDate);
  });
});

// ===========================================================================
// Clearing the schedule date
// ===========================================================================

describe('Clearing dueDate makes a subscription detection-only', () => {
  it('removes the open period when the schedule date is cleared', async () => {
    const d1 = futureDate({ monthsAhead: 1, day: 10 });
    const { sub } = await createMonthlySub({ dueDate: d1 });
    expect(await getOpenPeriods({ subId: sub.id })).toHaveLength(1);

    await helpers.updateSubscription({ id: sub.id, dueDate: null, raw: true });

    const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(detail.periods.filter(isOpen)).toHaveLength(0);

    // The list's "due in N days" chip is gone — nothing left to fall due.
    const list = await helpers.getSubscriptions({ raw: true });
    expect(list.find((s) => s.id === sub.id)!.currentPeriod).toBeNull();
  });
});

// ===========================================================================
// Lowering maxOccurrences
// ===========================================================================

describe('Lowering maxOccurrences on an installment', () => {
  it('prunes the surplus open period and completes when lowered to the consumed count', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 3 });

    const p1 = await getOpenPeriod({ subId: sub.id });
    const paid1 = await helpers.markSubscriptionPeriodPaid({
      id: sub.id,
      periodId: p1!.id,
      createTransaction: true,
      raw: true,
    });
    const txId = paid1.transactionId!;

    // 1 paid + 1 open = 2 periods. Lower the cap to 1.
    await helpers.updateSubscription({ id: sub.id, maxOccurrences: 1, raw: true });

    const detail = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(detail.completedAt).not.toBeNull();
    expect(detail.isActive).toBe(false);
    // No open period beyond the cap, and exactly the single paid period survives.
    expect(detail.periods.filter(isOpen)).toHaveLength(0);
    expect(detail.periods).toHaveLength(1);
    expect(detail.periods[0]!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.paid);

    // The paid period's booked transaction is untouched.
    const tx = await helpers.getTransactionById({ id: txId, raw: true });
    expect(tx).not.toBeNull();
  });

  it('rejects lowering maxOccurrences below the number of payments already made', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 3 });

    // Pay all three.
    for (let i = 0; i < 3; i++) {
      const open = await getOpenPeriod({ subId: sub.id });
      await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: open!.id, createTransaction: true, raw: true });
    }

    const completed = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(completed.completedAt).not.toBeNull();

    const res = await helpers.updateSubscription({ id: sub.id, maxOccurrences: 2, raw: false });
    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);

    // Unchanged.
    const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(after.maxOccurrences).toBe(3);
  });
});

// ===========================================================================
// No duplicate open period when editing an overdue installment
// ===========================================================================

describe('Editing an installment whose period is overdue', () => {
  it('does not create a second open period', async () => {
    // Born overdue: dueDate in the past.
    const account = await helpers.createAccount({ raw: true });
    const dueDate = pastDateDays({ daysAgo: 1 });
    const sub = await helpers.createSubscription({
      name: 'Overdue installment',
      type: SUBSCRIPTION_TYPES.installment,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      maxOccurrences: 3,
      raw: true,
    });

    const before = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(before.periods).toHaveLength(1);
    expect(before.periods[0]!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);

    // A benign edit that re-sends the full installment payload (form behaviour).
    await helpers.updateSubscription({
      id: sub.id,
      name: 'Renamed',
      type: SUBSCRIPTION_TYPES.installment,
      maxOccurrences: 3,
      dueDate,
      raw: true,
    });

    const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(after.periods.filter(isOpen)).toHaveLength(1);
    expect(after.periods).toHaveLength(1);
  });
});

// ===========================================================================
// Linking an account to a partially-paid installment
// ===========================================================================

describe('Linking an account to an installment that already has paid history', () => {
  it('does not drag the live open period back onto the stale anchor date', async () => {
    // Installment with NO account, anchored a month back so its first periods are
    // already due. The stored dueDate (anchor) never advances as periods are paid
    // — only the live open period moves forward — so the two diverge.
    const anchor = pastDateMonths({ monthsAgo: 1, day: 15 });
    const sub = await helpers.createSubscription({
      name: 'Phone installment',
      type: SUBSCRIPTION_TYPES.installment,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: anchor,
      dueDate: anchor,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      maxOccurrences: 12,
      raw: true,
    });

    // Mark two periods paid WITHOUT an account (plain mark-paid, no transaction).
    const p1 = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p1!.id, raw: true });
    const p2 = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p2!.id, raw: true });

    // The live open period now sits two cycles ahead of the stored anchor.
    const openBefore = await getOpenPeriod({ subId: sub.id });
    const before = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(before.periods).toHaveLength(3);
    expect(openBefore!.dueDate).not.toBe(anchor);

    // Link an account. The edit form re-sends the FULL payload, including the
    // stored (stale) anchor dueDate unchanged.
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });
    await helpers.updateSubscription({
      id: sub.id,
      type: SUBSCRIPTION_TYPES.installment,
      maxOccurrences: 12,
      dueDate: anchor,
      accountId: account.id,
      raw: true,
    });

    const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    // Nothing added or moved: still 3 periods, the open one untouched.
    expect(after.periods).toHaveLength(3);
    const openAfter = after.periods.filter(isOpen);
    expect(openAfter).toHaveLength(1);
    expect(openAfter[0]!.id).toBe(openBefore!.id);
    expect(openAfter[0]!.dueDate).toBe(openBefore!.dueDate);
    expect(openAfter[0]!.status).toBe(openBefore!.status);
    // No two periods collide on a due date (the duplicate-row symptom).
    const dueDates = after.periods.map((p) => p.dueDate);
    expect(new Set(dueDates).size).toBe(dueDates.length);
  });
});

// ===========================================================================
// Revert with an overdue successor
// ===========================================================================

describe('Reverting when the auto-created successor is overdue', () => {
  it('leaves exactly one open period (deletes the overdue successor)', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });
    const dueDate = pastDateMonths({ monthsAgo: 2, day: 15 });
    const sub = await helpers.createSubscription({
      name: 'Backdated bill',
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: dueDate,
      dueDate,
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount: 20,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const p1 = await getOpenPeriod({ subId: sub.id });
    expect(p1!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);

    // Pay P1 → successor P2 is born overdue (still a past month).
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p1!.id, createTransaction: true, raw: true });
    const p2 = await getOpenPeriod({ subId: sub.id });
    expect(p2!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);

    // Revert P1 → the overdue successor must be removed so only one open period remains.
    await helpers.revertSubscriptionPeriod({ id: sub.id, periodId: p1!.id, raw: true });

    const open = await getOpenPeriods({ subId: sub.id });
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(p1!.id);
  });
});

// ===========================================================================
// Toggling a completed installment active
// ===========================================================================

describe('Reactivating an installment via toggle-active', () => {
  it('does not leave a zombie (active, no completion, no open period) for a cap-reached plan', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 1 });

    const p1 = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p1!.id, createTransaction: true, raw: true });

    const completed = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(completed.completedAt).not.toBeNull();
    expect(completed.isActive).toBe(false);

    await helpers.toggleSubscriptionActive({ id: sub.id, isActive: true, raw: true });

    const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    const hasOpen = after.periods.some(isOpen);
    const isZombie = after.isActive && after.completedAt == null && !hasOpen;
    expect(isZombie).toBe(false);
    // A cap-reached installment stays finished — reactivation without room is a no-op.
    expect(after.completedAt).not.toBeNull();
    expect(after.isActive).toBe(false);
  });

  it('resumes a manually paused installment that still has room, keeping its open period', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 2 });

    const p1 = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p1!.id, createTransaction: true, raw: true });

    // Manually pause (not finished — completedAt stays null).
    await helpers.toggleSubscriptionActive({ id: sub.id, isActive: false, raw: true });
    const paused = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(paused.isActive).toBe(false);
    expect(paused.completedAt).toBeNull();

    await helpers.toggleSubscriptionActive({ id: sub.id, isActive: true, raw: true });

    const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(after.isActive).toBe(true);
    expect(after.completedAt).toBeNull();
    expect(after.periods.filter(isOpen)).toHaveLength(1);
  });
});

// ===========================================================================
// Converting an installment to a subscription
// ===========================================================================

describe('Converting an installment to a subscription', () => {
  it('clears maxOccurrences so the schedule keeps generating past the old cap', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 2 });

    const p1 = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p1!.id, createTransaction: true, raw: true });

    // Form re-sends maxOccurrences alongside the new type.
    await helpers.updateSubscription({
      id: sub.id,
      type: SUBSCRIPTION_TYPES.subscription,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      maxOccurrences: 2,
      raw: true,
    });

    const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(after.type).toBe(SUBSCRIPTION_TYPES.subscription);
    expect(after.maxOccurrences).toBeNull();
    expect(after.isActive).toBe(true);
    expect(after.completedAt).toBeNull();

    // Pay the open period; a further period must still be generated (old cap was 2).
    const open = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: open!.id, createTransaction: true, raw: true });
    const next = await getOpenPeriod({ subId: sub.id });
    expect(next).not.toBeNull();
  });

  it('reactivates a completed installment and gives it an open period', async () => {
    const { sub } = await createInstallment({ maxOccurrences: 1 });

    const p1 = await getOpenPeriod({ subId: sub.id });
    await helpers.markSubscriptionPeriodPaid({ id: sub.id, periodId: p1!.id, createTransaction: true, raw: true });

    const completed = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(completed.completedAt).not.toBeNull();
    expect(completed.isActive).toBe(false);

    // The form sends the stored isActive (false, because it was finished) — the
    // conversion must still reactivate it.
    await helpers.updateSubscription({
      id: sub.id,
      type: SUBSCRIPTION_TYPES.subscription,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      maxOccurrences: 1,
      isActive: false,
      raw: true,
    });

    const after = await helpers.getSubscriptionById({ id: sub.id, raw: true });
    expect(after.type).toBe(SUBSCRIPTION_TYPES.subscription);
    expect(after.completedAt).toBeNull();
    expect(after.isActive).toBe(true);
    expect(after.maxOccurrences).toBeNull();
    expect(after.periods.some(isOpen)).toBe(true);

    const activeList = await helpers.getSubscriptions({ isActive: true, raw: true });
    expect(activeList.find((s) => s.id === sub.id)).toBeDefined();
  });
});

// ===========================================================================
// Amount / currency consistency (service-layer guard)
// ===========================================================================

describe('Amount and currency must be edited together', () => {
  it('rejects clearing the currency while keeping the amount', async () => {
    const account = await helpers.createAccount({ raw: true });
    const sub = await helpers.createSubscription({
      name: 'Has amount',
      type: SUBSCRIPTION_TYPES.bill,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: futureDate({ monthsAhead: 1, day: 10 }),
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      expectedAmount: 10,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: true,
    });

    const res = await helpers.updateSubscription({ id: sub.id, expectedCurrencyCode: null, raw: false });
    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('rejects setting an amount without a currency', async () => {
    const account = await helpers.createAccount({ raw: true });
    const bill = await helpers.createSubscription({
      name: 'No amount bill',
      type: SUBSCRIPTION_TYPES.bill,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: futureDate({ monthsAhead: 1, day: 10 }),
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      raw: true,
    });

    const res = await helpers.updateSubscription({ id: bill.id, expectedAmount: 50, raw: false });
    expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('allows editing both together', async () => {
    const account = await helpers.createAccount({ raw: true });
    const bill = await helpers.createSubscription({
      name: 'Bill',
      type: SUBSCRIPTION_TYPES.bill,
      frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      startDate: futureDate({ monthsAhead: 1, day: 10 }),
      accountId: account.id,
      categoryId: global.DEFAULT_CATEGORY_ID,
      raw: true,
    });

    const res = await helpers.updateSubscription({
      id: bill.id,
      expectedAmount: 20,
      expectedCurrencyCode: global.BASE_CURRENCY.code,
      raw: false,
    });
    expect(res.statusCode).toBe(200);
  });
});
