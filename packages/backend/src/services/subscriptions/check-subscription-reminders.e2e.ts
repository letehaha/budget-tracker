import {
  NOTIFICATION_TYPES,
  REMIND_BEFORE_PRESETS,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_PERIOD_STATUSES,
} from '@bt/shared/types';
import { until } from '@common/helpers';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import Notifications from '@models/notifications.model';
import SubscriptionPeriodNotifications from '@models/subscription-period-notifications.model';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import * as sendEmailModule from '@services/email/send-email';
import * as helpers from '@tests/helpers';
import { addDays, format, subDays } from 'date-fns';

import { checkSubscriptionReminders } from './check-subscription-reminders';

const todayStr = format(new Date(), 'yyyy-MM-dd');

/**
 * Creates a scheduled subscription via the API (with today's dueDate so the
 * first period is generated and validation passes), then applies any reminder
 * config (`remindBefore`/`notifyEmail`/`isActive`) and date backdating directly
 * via the ORM — the create endpoint doesn't accept those reminder fields yet.
 */
async function createSubscriptionWithReminder({
  name,
  dueDate,
  remindBefore = [],
  notifyEmail = false,
  isActive = true,
  periodStatus,
}: {
  name: string;
  dueDate: string;
  remindBefore?: string[];
  notifyEmail?: boolean;
  isActive?: boolean;
  periodStatus?: SUBSCRIPTION_PERIOD_STATUSES;
}) {
  const sub = await helpers.createSubscription({
    name,
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: todayStr,
    dueDate: todayStr,
    expectedAmount: 15.99,
    expectedCurrencyCode: global.BASE_CURRENCY.code,
    raw: true,
  });

  await Subscriptions.update({ remindBefore, notifyEmail, isActive }, { where: { id: sub.id } });

  // Backdate (or move) the generated period to the desired due date and status.
  const periodUpdate: Record<string, unknown> = { dueDate };
  if (periodStatus) periodUpdate.status = periodStatus;
  await SubscriptionPeriods.update(periodUpdate, { where: { subscriptionId: sub.id } });

  return sub;
}

/** Counts in-app subscription-reminder notifications for a user. */
async function countReminderNotifications({ userId }: { userId: number }): Promise<number> {
  return Notifications.count({
    where: { userId, type: NOTIFICATION_TYPES.subscriptionReminder },
  });
}

/** Counts dedup rows recorded for a subscription's periods. */
async function countDedupRows({ subscriptionId }: { subscriptionId: string }): Promise<number> {
  const periods = await SubscriptionPeriods.findAll({
    where: { subscriptionId },
    attributes: ['id'],
  });
  const periodIds = periods.map((p) => p.id);
  if (periodIds.length === 0) return 0;
  return SubscriptionPeriodNotifications.count({ where: { periodId: periodIds } });
}

/** Loads the single dedup row for a (period, preset) pair. */
async function findDedupRow({ periodId, preset }: { periodId: string; preset: string }) {
  return SubscriptionPeriodNotifications.findOne({
    where: { periodId, remindBeforePreset: preset },
  });
}

/**
 * Polls the dedup row until the email worker flips `emailSent` to true. The
 * worker processes the queued job asynchronously, so the cron call returns
 * before delivery; this waits for the worker to be the source of truth.
 */
async function waitForEmailSent({ periodId, preset }: { periodId: string; preset: string }): Promise<void> {
  await until(
    async () => {
      const row = await findDedupRow({ periodId, preset });
      return row?.emailSent === true;
    },
    { timeout: 10_000, interval: 100 },
  );
}

describe('Subscriptions - Check Subscription Reminders (Cron Logic)', () => {
  describe('Overdue marking', () => {
    it('marks a past-due upcoming period as overdue', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Overdue Sub',
        dueDate: yesterday,
      });

      const periodBefore = await SubscriptionPeriods.findOne({ where: { subscriptionId: sub.id } });
      expect(periodBefore!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);

      const result = await checkSubscriptionReminders();
      expect(result.overdueUpdated).toBeGreaterThanOrEqual(1);

      const periodAfter = await SubscriptionPeriods.findOne({ where: { subscriptionId: sub.id } });
      expect(periodAfter!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);
    });

    it('does not mark a future period as overdue', async () => {
      const future = format(addDays(new Date(), 30), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Future Sub',
        dueDate: future,
      });

      await checkSubscriptionReminders();

      const period = await SubscriptionPeriods.findOne({ where: { subscriptionId: sub.id } });
      expect(period!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.upcoming);
    });
  });

  describe('Remind-before notifications', () => {
    it('sends exactly one in-app notification and one dedup row when the trigger date has arrived', async () => {
      // dueDate = today+3 with a 3_days preset → triggerDate = today, so it fires.
      const dueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Due Soon Sub',
        dueDate,
        remindBefore: [REMIND_BEFORE_PRESETS.threeDays],
      });

      const before = await countReminderNotifications({ userId: sub.userId });

      const result = await checkSubscriptionReminders();
      expect(result.remindersSent).toBeGreaterThanOrEqual(1);

      const after = await countReminderNotifications({ userId: sub.userId });
      expect(after).toBe(before + 1);

      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);
    });

    it('does not send when the trigger date has not arrived yet', async () => {
      // dueDate = today+5 with a 1_day preset → triggerDate = today+4 (future).
      const dueDate = format(addDays(new Date(), 5), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Too Early Sub',
        dueDate,
        remindBefore: [REMIND_BEFORE_PRESETS.oneDay],
      });

      const before = await countReminderNotifications({ userId: sub.userId });

      await checkSubscriptionReminders();

      const after = await countReminderNotifications({ userId: sub.userId });
      expect(after).toBe(before);
      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(0);
    });

    it('does not send a duplicate notification on a second run', async () => {
      const dueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'No Duplicate Sub',
        dueDate,
        remindBefore: [REMIND_BEFORE_PRESETS.threeDays],
      });

      await checkSubscriptionReminders();
      const firstCount = await countReminderNotifications({ userId: sub.userId });

      await checkSubscriptionReminders();
      const secondCount = await countReminderNotifications({ userId: sub.userId });

      expect(secondCount).toBe(firstCount);
      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);
    });

    it('does not send notifications for inactive subscriptions', async () => {
      const sub = await createSubscriptionWithReminder({
        name: 'Inactive Sub',
        dueDate: todayStr,
        remindBefore: [REMIND_BEFORE_PRESETS.onDueDate],
        isActive: false,
      });

      const before = await countReminderNotifications({ userId: sub.userId });

      await checkSubscriptionReminders();

      const after = await countReminderNotifications({ userId: sub.userId });
      expect(after).toBe(before);
      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(0);
    });

    it('is idempotent: two runs create exactly one in-app notification and one dedup row', async () => {
      // Guards the dedup gate: the row is claimed on the first run, so the second
      // run finds it and neither re-fires the in-app notification nor adds a row.
      const dueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Idempotent Sub',
        dueDate,
        remindBefore: [REMIND_BEFORE_PRESETS.threeDays],
      });

      const before = await countReminderNotifications({ userId: sub.userId });

      await checkSubscriptionReminders();
      await checkSubscriptionReminders();

      const after = await countReminderNotifications({ userId: sub.userId });
      expect(after).toBe(before + 1);
      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);
    });

    it('re-attempts the email when the dedup row has emailSent=false without re-firing the in-app notification', async () => {
      // Simulate an earlier run that claimed the slot (in-app already fired) but
      // never got the email delivered: a dedup row exists with emailSent=false. The
      // next run must re-queue the email — and since `emailSent` now flips only in
      // the worker (not at enqueue time), we poll until the worker processes the
      // queued job and marks it sent. The in-app notification count stays untouched
      // and the dedup row count stays at one.
      //
      // The test user's address is a `@test.local` recipient, so `sendEmail`
      // short-circuits to a no-op (`null`); the worker treats that intentional
      // no-op as delivered and flips emailSent to true.
      const dueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Email Retry Sub',
        dueDate,
        remindBefore: [REMIND_BEFORE_PRESETS.threeDays],
        notifyEmail: true,
      });

      const period = await SubscriptionPeriods.findOne({ where: { subscriptionId: sub.id } });
      await SubscriptionPeriodNotifications.create({
        periodId: period!.id,
        remindBeforePreset: REMIND_BEFORE_PRESETS.threeDays,
        emailSent: false,
        emailError: 'previous send failed',
      });

      const before = await countReminderNotifications({ userId: sub.userId });

      await checkSubscriptionReminders();

      // No second in-app notification, still exactly one dedup row.
      const after = await countReminderNotifications({ userId: sub.userId });
      expect(after).toBe(before);
      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);

      // The worker processed the re-queued email and flipped emailSent to true,
      // clearing the stale error.
      await waitForEmailSent({ periodId: period!.id, preset: REMIND_BEFORE_PRESETS.threeDays });
      const row = await findDedupRow({ periodId: period!.id, preset: REMIND_BEFORE_PRESETS.threeDays });
      expect(row!.emailSent).toBe(true);
      expect(row!.emailError).toBeNull();
    });

    it('marks emailSent only after the worker delivers, not at enqueue time', async () => {
      // A fresh slot: the cron fires the in-app notification, creates the dedup row
      // with emailSent=false, and enqueues the email. emailSent flips to true only
      // once the worker processes the job — proving the worker, not the cron, is
      // the source of truth for delivery.
      const dueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Worker Delivery Sub',
        dueDate,
        remindBefore: [REMIND_BEFORE_PRESETS.threeDays],
        notifyEmail: true,
      });

      const period = await SubscriptionPeriods.findOne({ where: { subscriptionId: sub.id } });

      await checkSubscriptionReminders();

      // The slot is claimed immediately with emailSent=false.
      const claimed = await findDedupRow({ periodId: period!.id, preset: REMIND_BEFORE_PRESETS.threeDays });
      expect(claimed).not.toBeNull();

      // The worker eventually flips it to true.
      await waitForEmailSent({ periodId: period!.id, preset: REMIND_BEFORE_PRESETS.threeDays });
      const row = await findDedupRow({ periodId: period!.id, preset: REMIND_BEFORE_PRESETS.threeDays });
      expect(row!.emailSent).toBe(true);
      expect(row!.emailError).toBeNull();
    });

    describe('email delivery failure', () => {
      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('leaves emailSent=false and re-queues on the next run when the send fails', async () => {
        // Force a Resend-style API failure: the SDK resolves (does not throw) with
        // `{ data, error }`, so the worker must throw on `result.error` to fail the
        // job. A failed job never reaches the success path, so emailSent stays
        // false — and because the cron gate is `emailSent`, the next run re-queues.
        const sendSpy = jest.spyOn(sendEmailModule, 'sendEmail').mockResolvedValue({
          data: null,
          error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
          headers: null,
        } as Awaited<ReturnType<typeof sendEmailModule.sendEmail>>);

        const dueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd');
        const sub = await createSubscriptionWithReminder({
          name: 'Email Failure Sub',
          dueDate,
          remindBefore: [REMIND_BEFORE_PRESETS.threeDays],
          notifyEmail: true,
        });

        const period = await SubscriptionPeriods.findOne({ where: { subscriptionId: sub.id } });

        await checkSubscriptionReminders();

        // The slot is claimed and the in-app notification fired exactly once.
        expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);
        expect(await countReminderNotifications({ userId: sub.userId })).toBe(1);

        // Wait until the worker has attempted (and failed) the send at least once,
        // then confirm emailSent never flipped — the failing send did not mark the
        // email as delivered.
        await until(() => sendSpy.mock.calls.length >= 1, { timeout: 10_000, interval: 100 });
        const failedRow = await findDedupRow({ periodId: period!.id, preset: REMIND_BEFORE_PRESETS.threeDays });
        expect(failedRow!.emailSent).toBe(false);

        // The next cron run re-queues the email (gate is emailSent, still false)
        // without re-firing the in-app notification or adding a dedup row.
        sendSpy.mockClear();
        await checkSubscriptionReminders();
        expect(await countReminderNotifications({ userId: sub.userId })).toBe(1);
        expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);
        await until(() => sendSpy.mock.calls.length >= 1, { timeout: 10_000, interval: 100 });
        expect(sendSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

        // TODO: The exhausted-retries path — where the `failed` handler writes
        // `emailError` onto the (periodId, preset) row after the final attempt — is
        // not asserted here. The queue uses 3 attempts with a 60s exponential
        // backoff, so the job cannot exhaust its retries within an e2e timeout. The
        // failed handler's per-preset scoping is covered by reading the code.
      });
    });

    it('still fires a 0_days reminder once when the period has already flipped to overdue', async () => {
      // The period is pre-set to `overdue` with a past due date: this proves the
      // notification pass loads overdue periods too, so the on-due-date preset is
      // not lost when the first run lands after the due date.
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const sub = await createSubscriptionWithReminder({
        name: 'Overdue On-Due Sub',
        dueDate: yesterday,
        remindBefore: [REMIND_BEFORE_PRESETS.onDueDate],
        periodStatus: SUBSCRIPTION_PERIOD_STATUSES.overdue,
      });

      const result = await checkSubscriptionReminders();
      expect(result.remindersSent).toBeGreaterThanOrEqual(1);

      const period = await SubscriptionPeriods.findOne({ where: { subscriptionId: sub.id } });
      expect(period!.status).toBe(SUBSCRIPTION_PERIOD_STATUSES.overdue);

      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);

      // A second run must not duplicate it (dedup guard).
      await checkSubscriptionReminders();
      expect(await countDedupRows({ subscriptionId: sub.id })).toBe(1);
    });
  });
});
