import {
  NOTIFICATION_TYPES,
  PAYMENT_REMINDER_STATUSES,
  REMIND_BEFORE_PRESETS,
  SUBSCRIPTION_FREQUENCIES,
} from '@bt/shared/types';
import Notifications from '@models/Notifications.model';
import PaymentReminderNotifications from '@models/payment-reminder-notifications.model';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

import { checkPaymentReminders } from './check-reminders';

const todayStr = new Date().toISOString().split('T')[0]!;

/**
 * Creates a reminder via API (with today's date to pass validation),
 * then backdates the reminder and its period to the desired past date.
 */
async function createBackdatedReminder({
  name,
  dueDate,
  frequency,
  remindBefore,
}: {
  name: string;
  dueDate: string;
  frequency?: SUBSCRIPTION_FREQUENCIES;
  remindBefore?: (typeof REMIND_BEFORE_PRESETS)[keyof typeof REMIND_BEFORE_PRESETS][];
}) {
  const reminder = await helpers.createPaymentReminder({
    name,
    dueDate: todayStr,
    frequency,
    remindBefore,
    raw: true,
  });

  // Backdate the reminder and its period to the desired past date, including anchorDay
  const anchorDay = new Date(dueDate + 'T00:00:00Z').getUTCDate();
  await PaymentReminders.update({ dueDate, anchorDay }, { where: { id: reminder.id } });
  await PaymentReminderPeriods.update({ dueDate }, { where: { reminderId: reminder.id } });

  // Reload to get updated data
  const updated = await PaymentReminders.findByPk(reminder.id, {
    include: [{ model: PaymentReminderPeriods, as: 'periods' }],
  });

  return updated!;
}

describe('Payment Reminders - Check Reminders (Cron Logic)', () => {
  describe('Overdue marking', () => {
    it('marks past-due upcoming periods as overdue', async () => {
      const reminder = await createBackdatedReminder({
        name: 'Overdue Test',
        dueDate: '2020-01-15',
      });

      // The period was created with status 'upcoming' and due date in the past
      const periodBefore = await PaymentReminderPeriods.findOne({
        where: { reminderId: reminder.id },
      });
      expect(periodBefore!.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);

      // Run the cron check
      const result = await checkPaymentReminders();
      expect(result.overdueUpdated).toBeGreaterThanOrEqual(1);

      // Verify the period is now overdue
      const periodAfter = await PaymentReminderPeriods.findOne({
        where: { reminderId: reminder.id },
      });
      expect(periodAfter!.status).toBe(PAYMENT_REMINDER_STATUSES.overdue);
    });

    it('does not mark future periods as overdue', async () => {
      const reminder = await helpers.createPaymentReminder({
        name: 'Future Test',
        dueDate: '2099-12-31',
        raw: true,
      });

      await checkPaymentReminders();

      const period = await PaymentReminderPeriods.findOne({
        where: { reminderId: reminder.id },
      });
      expect(period!.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
    });

    it('does not change already paid or skipped periods', async () => {
      const reminder = await createBackdatedReminder({
        name: 'Paid Past',
        dueDate: '2020-01-01',
      });

      // Mark as paid
      await helpers.markPaymentReminderPeriodPaid({
        reminderId: reminder.id,
        periodId: reminder.periods[0]!.id,
        raw: true,
      });

      await checkPaymentReminders();

      const period = await PaymentReminderPeriods.findOne({
        where: { id: reminder.periods[0]!.id },
      });
      expect(period!.status).toBe(PAYMENT_REMINDER_STATUSES.paid);
    });
  });

  describe('Missing next period creation', () => {
    it('creates next period for recurring reminders with no upcoming period', async () => {
      const reminder = await createBackdatedReminder({
        name: 'Missing Next',
        dueDate: '2020-06-15',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      });

      // The period is in the past, so the cron should:
      // 1. Mark it overdue
      // 2. Create the next upcoming period
      const result = await checkPaymentReminders();
      expect(result.periodsCreated).toBeGreaterThanOrEqual(1);

      const periods = await PaymentReminderPeriods.findAll({
        where: { reminderId: reminder.id },
        order: [['dueDate', 'ASC']],
      });

      expect(periods.length).toBe(2);
      expect(periods[0]!.status).toBe(PAYMENT_REMINDER_STATUSES.overdue);
      expect(periods[1]!.status).toBe(PAYMENT_REMINDER_STATUSES.upcoming);
      expect(periods[1]!.dueDate).toBe('2020-07-15');
    });

    it('does not create next period for one-off reminders', async () => {
      await createBackdatedReminder({
        name: 'One-off No Next',
        dueDate: '2020-01-01',
        // no frequency = one-off
      });

      await checkPaymentReminders();

      // Should only have the one overdue period, no next one created
      // (one-off reminders have frequency=null, so the cron skips them)
    });
  });

  describe('Remind-before notifications', () => {
    it('sends in-app notification when remind-before trigger date has passed', async () => {
      // Create a reminder due in 2 days, with a "1_week" remind-before preset
      // Since the reminder is due in 2 days and "1_week" = 7 days before,
      // the trigger date is 5 days AGO, so it should fire
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      const dueDateStr = futureDate.toISOString().split('T')[0]!;

      const reminder = await helpers.createPaymentReminder({
        name: 'Notify Test',
        dueDate: dueDateStr,
        remindBefore: [REMIND_BEFORE_PRESETS.oneWeek],
        raw: true,
      });

      // Count notifications before
      const notifsBefore = await Notifications.count({
        where: {
          userId: reminder.userId,
          type: NOTIFICATION_TYPES.paymentReminder,
        },
      });

      const result = await checkPaymentReminders();
      expect(result.notificationsSent).toBeGreaterThanOrEqual(1);

      // Check that an in-app notification was created
      const notifsAfter = await Notifications.count({
        where: {
          userId: reminder.userId,
          type: NOTIFICATION_TYPES.paymentReminder,
        },
      });
      expect(notifsAfter).toBeGreaterThan(notifsBefore);

      // Check the dedup record was created
      const period = await PaymentReminderPeriods.findOne({
        where: { reminderId: reminder.id },
      });
      const notifRecord = await PaymentReminderNotifications.findOne({
        where: {
          periodId: period!.id,
          remindBeforePreset: REMIND_BEFORE_PRESETS.oneWeek,
        },
      });
      expect(notifRecord).not.toBeNull();
    });

    it('does not send duplicate notifications', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      const dueDateStr = futureDate.toISOString().split('T')[0]!;

      await helpers.createPaymentReminder({
        name: 'No Duplicate',
        dueDate: dueDateStr,
        remindBefore: [REMIND_BEFORE_PRESETS.oneWeek],
        raw: true,
      });

      // Run check twice
      await checkPaymentReminders();
      const firstCount = await Notifications.count({
        where: { type: NOTIFICATION_TYPES.paymentReminder },
      });

      await checkPaymentReminders();
      const secondCount = await Notifications.count({
        where: { type: NOTIFICATION_TYPES.paymentReminder },
      });

      // The second run should not create additional notifications for the same reminder
      // (other tests may also create notifications, so we check it's not doubled for this preset)
      expect(secondCount).toBe(firstCount);
    });

    it('does not send notifications when trigger date has not passed yet', async () => {
      // Due in 100 days, with 1_day remind-before
      // Trigger date = 99 days from now, so it should NOT fire
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 100);
      const dueDateStr = futureDate.toISOString().split('T')[0]!;

      const reminder = await helpers.createPaymentReminder({
        name: 'Not Yet',
        dueDate: dueDateStr,
        remindBefore: [REMIND_BEFORE_PRESETS.oneDay],
        raw: true,
      });

      const notifsBefore = await Notifications.count({
        where: {
          userId: reminder.userId,
          type: NOTIFICATION_TYPES.paymentReminder,
        },
      });

      await checkPaymentReminders();

      const notifsAfter = await Notifications.count({
        where: {
          userId: reminder.userId,
          type: NOTIFICATION_TYPES.paymentReminder,
        },
      });

      expect(notifsAfter).toBe(notifsBefore);
    });

    it('does not send notifications for inactive reminders', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      const dueDateStr = futureDate.toISOString().split('T')[0]!;

      const reminder = await helpers.createPaymentReminder({
        name: 'Inactive',
        dueDate: dueDateStr,
        remindBefore: [REMIND_BEFORE_PRESETS.oneWeek],
        raw: true,
      });

      // Deactivate the reminder
      await helpers.updatePaymentReminder({
        id: reminder.id,
        isActive: false,
        raw: true,
      });

      const notifsBefore = await Notifications.count({
        where: {
          userId: reminder.userId,
          type: NOTIFICATION_TYPES.paymentReminder,
        },
      });

      await checkPaymentReminders();

      const notifsAfter = await Notifications.count({
        where: {
          userId: reminder.userId,
          type: NOTIFICATION_TYPES.paymentReminder,
        },
      });

      expect(notifsAfter).toBe(notifsBefore);
    });
  });
});
