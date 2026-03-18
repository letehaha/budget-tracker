import {
  PAYMENT_REMINDER_STATUSES,
  REMIND_BEFORE_PRESETS,
  SUBSCRIPTION_FREQUENCIES,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import * as helpers from '@tests/helpers';
import { addMonths, addWeeks, addYears, format } from 'date-fns';

import { checkPaymentReminders } from './check-reminders';

/** Returns a date string N months from today, on the given day-of-month. */
function futureDate({ monthsAhead, day }: { monthsAhead: number; day: number }): string {
  const d = addMonths(new Date(), monthsAhead);
  d.setDate(day);
  return format(d, 'yyyy-MM-dd');
}

/**
 * Create a second user and return their session cookies.
 */
async function createSecondUser(): Promise<string> {
  const signupRes = await helpers.makeAuthRequest({
    method: 'post',
    url: '/auth/sign-up/email',
    payload: {
      email: `user2-${Date.now()}@test.local`,
      password: 'testpassword123',
      name: 'Second User',
    },
  });
  return helpers.extractCookies(signupRes);
}

/**
 * Execute a callback as a different user by temporarily swapping auth cookies.
 */
async function asUser<T>({ cookies, fn }: { cookies: string; fn: () => Promise<T> }): Promise<T> {
  const original = global.APP_AUTH_COOKIES;
  global.APP_AUTH_COOKIES = cookies;
  try {
    return await fn();
  } finally {
    global.APP_AUTH_COOKIES = original;
  }
}

describe('Payment Reminders', () => {
  describe('CRUD', () => {
    it('creates a one-off reminder with minimal fields', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Property Tax',
        dueDate: '2026-04-15',
        raw: true,
      });

      expect(reminder.name).toBe('Property Tax');
      expect(reminder.dueDate).toBe('2026-04-15');
      expect(reminder.frequency).toBeNull();
      expect(reminder.expectedAmount).toBeNull();
      expect(reminder.currencyCode).toBeNull();
      expect(reminder.isActive).toBe(true);
      expect(reminder.notifyEmail).toBe(false);
      expect(reminder.preferredTime).toBe(8);
      expect(reminder.timezone).toBe('UTC');
      expect(reminder.anchorDay).toBe(15);
      expect(reminder.periods).toHaveLength(1);
      expect(reminder.periods[0]!.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
      expect(reminder.periods[0]!.dueDate).toBe('2026-04-15');
    });

    it('creates a recurring reminder with all fields', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Rent',
        dueDate: '2026-04-01',
        expectedAmount: 120000,
        currencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        remindBefore: [REMIND_BEFORE_PRESETS.oneDay, REMIND_BEFORE_PRESETS.oneWeek],
        notifyEmail: true,
        preferredTime: 8,
        timezone: 'Europe/Kyiv',
        notes: 'Apartment rent',
        raw: true,
      });

      expect(reminder.name).toBe('Rent');
      expect(reminder.expectedAmount).toBe(120000);
      expect(reminder.currencyCode).toBe('USD');
      expect(reminder.frequency).toBe(SUBSCRIPTION_FREQUENCIES.monthly);
      expect(reminder.remindBefore).toEqual([REMIND_BEFORE_PRESETS.oneDay, REMIND_BEFORE_PRESETS.oneWeek]);
      expect(reminder.notifyEmail).toBe(true);
      expect(reminder.preferredTime).toBe(8);
      expect(reminder.timezone).toBe('Europe/Kyiv');
      expect(reminder.notes).toBe('Apartment rent');
      expect(reminder.anchorDay).toBe(1);
      expect(reminder.periods).toHaveLength(1);
    });

    it('creates a reminder linked to a subscription', async () => {
      const sub = await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 1599,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2026-01-01',
        raw: true,
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'ignored-name',
        dueDate: '2026-04-01',
        subscriptionId: sub.id,
        raw: true,
      });

      // Name, amount, currency, frequency should be synced from subscription
      expect(reminder.name).toBe('Netflix');
      expect(reminder.expectedAmount).toBe(15.99);
      expect(reminder.currencyCode).toBe('USD');
      expect(reminder.frequency).toBe(SUBSCRIPTION_FREQUENCIES.monthly);
      expect(reminder.subscriptionId).toBe(sub.id);
    });

    it('rejects creation with amount but no currency', async () => {
      const res = await helpers.createPaymentReminder({
        name: 'Bad Reminder',
        dueDate: '2026-04-01',
        expectedAmount: 5000,
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects creation with a past due date', async () => {
      const res = await helpers.createPaymentReminder({
        name: 'Past Reminder',
        dueDate: '2020-01-01',
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects creation with yesterday as due date', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const res = await helpers.createPaymentReminder({
        name: 'Yesterday Reminder',
        dueDate: yesterdayStr,
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });

    it('allows creation with today as due date', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      const reminder = await helpers.createPaymentReminder({
        name: 'Today Reminder',
        dueDate: todayStr,
        raw: true,
      });

      expect(reminder.name).toBe('Today Reminder');
      expect(reminder.dueDate).toBe(todayStr);
    });

    it('rejects creation with invalid preferredTime', async () => {
      const res = await helpers.createPaymentReminder({
        name: 'Bad Time',
        dueDate: '2026-04-01',
        preferredTime: 7 as never,
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });

    it('lists reminders', async () => {
      await helpers.createPaymentReminder({
        name: 'Reminder A',
        dueDate: '2026-05-01',
        raw: true,
      });
      await helpers.createPaymentReminder({
        name: 'Reminder B',
        dueDate: '2026-06-01',
        raw: true,
      });

      const list = await helpers.getPaymentReminders({ raw: true });
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('gets reminder by id', async () => {
      const created = await helpers.createPaymentReminder({
        name: 'Detail Reminder',
        dueDate: '2026-04-15',
        raw: true,
      });

      const detail = await helpers.getPaymentReminderById({ id: created.id, raw: true });
      expect(detail.name).toBe('Detail Reminder');
      expect(detail.periods).toBeDefined();
    });

    it('returns 404 for non-existent reminder', async () => {
      const res = await helpers.getPaymentReminderById({
        id: '00000000-0000-0000-0000-000000000000',
        raw: false,
      });
      expect(res.statusCode).toBe(404);
    });

    it('updates a reminder', async () => {
      const created = await helpers.createPaymentReminder({
        name: 'Original',
        dueDate: '2026-04-01',
        raw: true,
      });

      const updated = await helpers.updatePaymentReminder({
        id: created.id,
        name: 'Updated',
        notes: 'New note',
        raw: true,
      });

      expect(updated.name).toBe('Updated');
      expect(updated.notes).toBe('New note');
    });

    it('rejects updating synced fields on subscription-linked reminder', async () => {
      const sub = await helpers.createSubscription({
        name: 'Spotify',
        expectedAmount: 999,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2026-01-01',
        raw: true,
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'ignored',
        dueDate: '2026-04-01',
        subscriptionId: sub.id,
        raw: true,
      });

      const res = await helpers.updatePaymentReminder({
        id: reminder.id,
        name: 'Cannot Change',
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });

    it('allows updating non-synced fields on subscription-linked reminder', async () => {
      const sub = await helpers.createSubscription({
        name: 'HBO',
        expectedAmount: 1499,
        expectedCurrencyCode: 'USD',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2026-01-01',
        raw: true,
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'ignored',
        dueDate: '2026-04-01',
        subscriptionId: sub.id,
        raw: true,
      });

      const updated = await helpers.updatePaymentReminder({
        id: reminder.id,
        notes: 'Updated note on sub-linked reminder',
        notifyEmail: true,
        raw: true,
      });

      expect(updated.notes).toBe('Updated note on sub-linked reminder');
      expect(updated.notifyEmail).toBe(true);
    });

    it('deletes a reminder', async () => {
      const created = await helpers.createPaymentReminder({
        name: 'To Delete',
        dueDate: '2026-04-01',
        raw: true,
      });

      const res = await helpers.deletePaymentReminder({ id: created.id });
      expect(res.statusCode).toBe(200);

      // Should be gone
      const getRes = await helpers.getPaymentReminderById({ id: created.id, raw: false });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 404 when deleting non-existent reminder', async () => {
      const res = await helpers.deletePaymentReminder({
        id: '00000000-0000-0000-0000-000000000000',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Periods', () => {
    it('gets periods for a reminder', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Period Test',
        dueDate: '2026-04-01',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });

      expect(result.periods).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.periods[0]!.dueDate).toBe('2026-04-01');
      expect(result.periods[0]!.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
    });

    it('supports pagination on periods', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Paginated',
        dueDate: '2026-04-01',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      // Mark the first period as paid to generate a second one
      const firstPeriod = reminder.periods[0]!;
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: firstPeriod.id,
        raw: true,
      });

      const page1 = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        limit: 1,
        offset: 0,
        raw: true,
      });
      expect(page1.periods).toHaveLength(1);
      expect(page1.total).toBe(2);

      const page2 = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        limit: 1,
        offset: 1,
        raw: true,
      });
      expect(page2.periods).toHaveLength(1);
    });

    it('returns 404 for periods of non-existent reminder', async () => {
      const res = await helpers.getPaymentReminderPeriods({
        reminderId: '00000000-0000-0000-0000-000000000000',
        raw: false,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Mark as Paid', () => {
    it('marks a period as paid without linking a transaction', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Pay Test',
        dueDate: '2026-04-01',
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      expect(period.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
      expect(period.paidAt).toBeTruthy();
      expect(period.transactionId).toBeNull();
    });

    it('marks a period as paid with a linked transaction', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1200,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'Pay with TX',
        dueDate: '2026-04-01',
        raw: true,
      });

      const period = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        transactionId: tx.id,
        raw: true,
      });

      expect(period.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
      expect(period.transactionId).toBe(tx.id);
    });

    it('generates next period after marking recurring reminder as paid', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Recurring Pay',
        dueDate: '2026-04-01',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });

      expect(result.total).toBe(2);
      // Find the new upcoming period
      const upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming).toBeDefined();
      expect(upcoming!.dueDate).toBe('2026-05-01');
    });

    it('does NOT generate next period for one-off reminder', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'One-off',
        dueDate: '2026-04-15',
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });

      expect(result.total).toBe(1);
      expect(result.periods[0]!.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
    });

    it('rejects marking an already paid period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Double Pay',
        dueDate: '2026-04-01',
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const res = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(409);
    });

    it('rejects linking the same transaction to two periods of the same reminder', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'Duplicate TX',
        dueDate: '2026-04-01',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      // Pay first period with this transaction
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        transactionId: tx.id,
        raw: true,
      });

      // Get the new upcoming period
      const periods = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      const nextPeriod = periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);

      // Try to link the same transaction to the next period
      const res = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: nextPeriod!.id,
        transactionId: tx.id,
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe('Skip Period', () => {
    it('skips a period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Skip Test',
        dueDate: '2026-04-01',
        raw: true,
      });

      const period = await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      expect(period.status).toBe(PAYMENT_REMINDER_STATUSES.skipped);
    });

    it('generates next period after skipping recurring reminder period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Skip Recurring',
        dueDate: '2026-04-01',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });

      expect(result.total).toBe(2);
      const upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming).toBeDefined();
      expect(upcoming!.dueDate).toBe('2026-05-01');
    });

    it('rejects skipping a paid period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Skip Paid',
        dueDate: '2026-04-01',
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const res = await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(409);
    });

    it('rejects skipping an already skipped period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Double Skip',
        dueDate: '2026-04-01',
        raw: true,
      });

      await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const res = await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('Unlink Transaction', () => {
    it('unlinks a transaction from a paid period', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        raw: true,
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000,
          transactionType: TRANSACTION_TYPES.expense,
        }),
      });

      const reminder = await helpers.createPaymentReminder({
        name: 'Unlink Test',
        dueDate: '2026-04-01',
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        transactionId: tx.id,
        raw: true,
      });

      const period = await helpers.unlinkPaymentReminderTransaction({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      // Should still be paid, just no transaction linked
      expect(period.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
      expect(period.transactionId).toBeNull();
    });
  });

  describe('Due Date Calculation', () => {
    it('handles month-end clamping for monthly frequency', async () => {
      // Pick a future month that has 31 days, followed by a month with 30 days.
      // e.g. 3 months ahead on day 31 — the next month may clamp.
      // Use explicit May 31 -> Jun 30 -> Jul 31 pattern but in a future year-safe way.
      // We use a fixed pattern here because clamping depends on specific calendar months.
      const baseYear = new Date().getFullYear() + 1;
      const reminder = await helpers.createPaymentReminder({
        name: 'Month End',
        dueDate: `${baseYear}-05-31`,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      expect(reminder.anchorDay).toBe(31);

      // Mark first period as paid
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      // Next period should be Jun 30 (June has only 30 days)
      let result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      let upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming!.dueDate).toBe(`${baseYear}-06-30`);

      // Mark Jun as paid, next should be Jul 31
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: upcoming!.id,
        raw: true,
      });

      result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming!.dueDate).toBe(`${baseYear}-07-31`);
    });

    it('calculates weekly next due date', async () => {
      const dueDate = futureDate({ monthsAhead: 2, day: 1 });
      const expectedNext = format(addWeeks(new Date(dueDate), 1), 'yyyy-MM-dd');

      const reminder = await helpers.createPaymentReminder({
        name: 'Weekly',
        dueDate,
        frequency: SUBSCRIPTION_FREQUENCIES.weekly,
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      const upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming!.dueDate).toBe(expectedNext);
    });

    it('calculates quarterly next due date', async () => {
      const dueDate = futureDate({ monthsAhead: 2, day: 15 });
      const expectedNext = format(addMonths(new Date(dueDate), 3), 'yyyy-MM-dd');

      const reminder = await helpers.createPaymentReminder({
        name: 'Quarterly',
        dueDate,
        frequency: SUBSCRIPTION_FREQUENCIES.quarterly,
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      const upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming!.dueDate).toBe(expectedNext);
    });

    it('calculates annual next due date', async () => {
      const dueDate = futureDate({ monthsAhead: 2, day: 15 });
      const expectedNext = format(addYears(new Date(dueDate), 1), 'yyyy-MM-dd');

      const reminder = await helpers.createPaymentReminder({
        name: 'Annual',
        dueDate,
        frequency: SUBSCRIPTION_FREQUENCIES.annual,
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      const upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming!.dueDate).toBe(expectedNext);
    });

    it('calculates biweekly next due date', async () => {
      const dueDate = futureDate({ monthsAhead: 2, day: 1 });
      const expectedNext = format(addWeeks(new Date(dueDate), 2), 'yyyy-MM-dd');

      const reminder = await helpers.createPaymentReminder({
        name: 'Biweekly',
        dueDate,
        frequency: SUBSCRIPTION_FREQUENCIES.biweekly,
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      const upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming!.dueDate).toBe(expectedNext);
    });

    it('calculates semi-annual next due date', async () => {
      const dueDate = futureDate({ monthsAhead: 2, day: 15 });
      const expectedNext = format(addMonths(new Date(dueDate), 6), 'yyyy-MM-dd');

      const reminder = await helpers.createPaymentReminder({
        name: 'Semi-Annual',
        dueDate,
        frequency: SUBSCRIPTION_FREQUENCIES.semiAnnual,
        raw: true,
      });

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const result = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      const upcoming = result.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.upcoming);
      expect(upcoming!.dueDate).toBe(expectedNext);
    });
  });

  describe('Cross-user isolation', () => {
    it("cannot get another user's reminder by ID", async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'User1 Reminder',
        dueDate: '2026-05-01',
        raw: true,
      });

      const user2Cookies = await createSecondUser();

      const res = await asUser({
        cookies: user2Cookies,
        fn: () => helpers.getPaymentReminderById({ id: reminder.id, raw: false }),
      });
      expect(res.statusCode).toBe(404);
    });

    it("cannot update another user's reminder", async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'User1 Reminder',
        dueDate: '2026-05-01',
        raw: true,
      });

      const user2Cookies = await createSecondUser();

      const res = await asUser({
        cookies: user2Cookies,
        fn: () => helpers.updatePaymentReminder({ id: reminder.id, name: 'Hacked', raw: false }),
      });
      expect(res.statusCode).toBe(404);
    });

    it("cannot delete another user's reminder", async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'User1 Reminder',
        dueDate: '2026-05-01',
        raw: true,
      });

      const user2Cookies = await createSecondUser();

      const res = await asUser({
        cookies: user2Cookies,
        fn: () => helpers.deletePaymentReminder({ id: reminder.id, raw: false }),
      });
      expect(res.statusCode).toBe(404);
    });

    it("cannot mark another user's period as paid", async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'User1 Reminder',
        dueDate: '2026-05-01',
        raw: true,
      });

      const user2Cookies = await createSecondUser();

      const res = await asUser({
        cookies: user2Cookies,
        fn: () =>
          helpers.markPaymentReminderPeriodPaid({
            reminderId: reminder.id,
            periodId: reminder.periods[0]!.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(404);
    });

    it("listing reminders only returns the calling user's reminders", async () => {
      await helpers.createPaymentReminder({
        name: 'User1 Reminder',
        dueDate: '2026-05-01',
        raw: true,
      });

      const user2Cookies = await createSecondUser();

      const user2List = await asUser({
        cookies: user2Cookies,
        fn: () => helpers.getPaymentReminders({ raw: true }),
      });
      expect(user2List).toHaveLength(0);
    });
  });

  describe('Mark as Paid - additional cases', () => {
    it('rejects marking a skipped period as paid', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Skip then Pay',
        dueDate: '2026-04-01',
        raw: true,
      });

      await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      const res = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(409);
    });

    it('returns 404 when period belongs to a different reminder', async () => {
      const reminder1 = await helpers.createPaymentReminder({
        name: 'Reminder 1',
        dueDate: '2026-04-01',
        raw: true,
      });
      const reminder2 = await helpers.createPaymentReminder({
        name: 'Reminder 2',
        dueDate: '2026-05-01',
        raw: true,
      });

      // Try to mark reminder2's period using reminder1's ID
      const res = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder1.id,
        periodId: reminder2.periods[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(404);
    });

    it('allows marking an overdue period as paid', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Overdue Pay',
        dueDate: '2026-04-01',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      // Set the period's due date to the past so checkPaymentReminders marks it overdue
      await PaymentReminderPeriods.update({ dueDate: '2025-01-01' }, { where: { id: reminder.periods[0]!.id } });

      // Run the cron to mark the period as overdue
      await checkPaymentReminders();

      // Verify the period is now overdue
      const periods = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      const overduePeriod = periods.periods.find((p) => p.status === PAYMENT_REMINDER_STATUSES.overdue);
      expect(overduePeriod).toBeDefined();

      // Mark the overdue period as paid
      const paid = await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: overduePeriod!.id,
        raw: true,
      });

      expect(paid.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
    });
  });

  describe('Skip Period - additional cases', () => {
    it('returns 404 when period belongs to a different reminder', async () => {
      const reminder1 = await helpers.createPaymentReminder({
        name: 'Reminder 1',
        dueDate: '2026-04-01',
        raw: true,
      });
      const reminder2 = await helpers.createPaymentReminder({
        name: 'Reminder 2',
        dueDate: '2026-05-01',
        raw: true,
      });

      const res = await helpers.skipPaymentReminderPeriod({
        reminderId: reminder1.id,
        periodId: reminder2.periods[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Unlink Transaction - additional cases', () => {
    it('returns 404 when period belongs to a different reminder', async () => {
      const reminder1 = await helpers.createPaymentReminder({
        name: 'Reminder 1',
        dueDate: '2026-04-01',
        raw: true,
      });
      const reminder2 = await helpers.createPaymentReminder({
        name: 'Reminder 2',
        dueDate: '2026-05-01',
        raw: true,
      });

      const res = await helpers.unlinkPaymentReminderTransaction({
        reminderId: reminder1.id,
        periodId: reminder2.periods[0]!.id,
        raw: false,
      });

      expect(res.statusCode).toBe(404);
    });

    it('succeeds on a period with no transaction linked', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Unlink Empty',
        dueDate: '2026-04-01',
        raw: true,
      });

      // Mark as paid without a transaction
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      // Unlink should succeed even though no transaction is linked
      const period = await helpers.unlinkPaymentReminderTransaction({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      expect(period.transactionId).toBeNull();
    });
  });

  describe('Update - additional cases', () => {
    it('recalculates anchorDay when dueDate is updated', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Anchor Test',
        dueDate: '2026-04-15',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      expect(reminder.anchorDay).toBe(15);

      const updated = await helpers.updatePaymentReminder({
        id: reminder.id,
        dueDate: '2026-04-28',
        raw: true,
      });

      expect(updated.anchorDay).toBe(28);
    });

    it('rejects update that sets amount without currency when existing currency is null', async () => {
      // Create with no amount/currency
      const reminder = await helpers.createPaymentReminder({
        name: 'Amount Only',
        dueDate: '2026-04-01',
        raw: true,
      });

      expect(reminder.expectedAmount).toBeNull();
      expect(reminder.currencyCode).toBeNull();

      // Update with only expectedAmount (no currencyCode)
      const res = await helpers.updatePaymentReminder({
        id: reminder.id,
        expectedAmount: 50,
        raw: false,
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe('includeInactive filter', () => {
    it('excludes inactive reminders by default', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'To Deactivate',
        dueDate: '2026-05-01',
        raw: true,
      });

      // Deactivate the reminder
      await helpers.updatePaymentReminder({
        id: reminder.id,
        isActive: false,
        raw: true,
      });

      const list = await helpers.getPaymentReminders({ raw: true });
      const found = list.find((r: { id: string }) => r.id === reminder.id);
      expect(found).toBeUndefined();
    });

    it('includes inactive reminders when includeInactive=true', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Inactive Visible',
        dueDate: '2026-05-01',
        raw: true,
      });

      await helpers.updatePaymentReminder({
        id: reminder.id,
        isActive: false,
        raw: true,
      });

      const list = await helpers.getPaymentReminders({ includeInactive: true, raw: true });
      const found = list.find((r: { id: string }) => r.id === reminder.id);
      expect(found).toBeDefined();
      expect(found!.isActive).toBe(false);
    });
  });

  describe('Delete cascade', () => {
    it('deletes associated periods when reminder is deleted', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Cascade Test',
        dueDate: '2026-04-01',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      const periodId = reminder.periods[0]!.id;

      // Delete the reminder
      await helpers.deletePaymentReminder({ id: reminder.id });

      // Verify periods are also deleted (must query DB directly since no endpoint for orphaned periods)
      const orphanedPeriod = await PaymentReminderPeriods.findByPk(periodId);
      expect(orphanedPeriod).toBeNull();
    });
  });

  describe('Revert Period', () => {
    it('reverts a paid period back to upcoming', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Revert Test',
        dueDate: '2099-06-15',
        raw: true,
      });

      const periodId = reminder.periods[0]!.id;

      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId,
      });

      const reverted = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId,
        raw: true,
      });

      expect(reverted.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
      expect(reverted.paidAt).toBeNull();
      expect(reverted.transactionId).toBeNull();
    });

    it('reverts a skipped period back to upcoming', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Revert Skip Test',
        dueDate: '2099-07-01',
        raw: true,
      });

      const periodId = reminder.periods[0]!.id;

      await helpers.skipPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId,
      });

      const reverted = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId,
        raw: true,
      });

      expect(reverted.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
      expect(reverted.paidAt).toBeNull();
    });

    it('returns 409 when reverting an already active period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Revert Active Test',
        dueDate: '2099-08-01',
        raw: true,
      });

      const periodId = reminder.periods[0]!.id;

      const res = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId,
        raw: false,
      });

      expect(res.statusCode).toBe(409);
    });

    it('removes auto-created upcoming period when reverting a paid recurring period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Revert Recurring',
        dueDate: '2099-09-15',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        raw: true,
      });

      const firstPeriodId = reminder.periods[0]!.id;

      // Mark as paid — this auto-creates the next upcoming period
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: firstPeriodId,
      });

      // Should have 2 periods now: paid + new upcoming
      const beforeRevert = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      expect(beforeRevert.total).toBe(2);

      // Revert — should delete the auto-created upcoming period
      await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: firstPeriodId,
      });

      const afterRevert = await helpers.getPaymentReminderPeriods({
        reminderId: reminder.id,
        raw: true,
      });
      expect(afterRevert.total).toBe(1);
      expect(afterRevert.periods[0]!.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
      expect(afterRevert.periods[0]!.id).toBe(firstPeriodId);
    });

    it('reverts to overdue when due date is in the past', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Revert Past Due',
        dueDate: '2099-01-01',
        raw: true,
      });

      const periodId = reminder.periods[0]!.id;

      // Move the period to the past and mark as paid to simulate the scenario
      await PaymentReminderPeriods.update(
        { status: PAYMENT_REMINDER_STATUSES.paid, paidAt: new Date(), dueDate: '2020-01-01' },
        { where: { id: periodId } },
      );

      const reverted = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId,
        raw: true,
      });

      expect(reverted.status).toBe(PAYMENT_REMINDER_STATUSES.overdue);
    });

    it('returns 404 for non-existent period', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Revert 404 Test',
        dueDate: '2099-10-01',
        raw: true,
      });

      const res = await helpers.revertPaymentReminderPeriod({
        reminderId: reminder.id,
        periodId: '00000000-0000-0000-0000-000000000000',
        raw: false,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
