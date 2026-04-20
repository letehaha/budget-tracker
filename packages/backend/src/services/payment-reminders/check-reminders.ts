import {
  NOTIFICATION_TYPES,
  PAYMENT_REMINDER_STATUSES,
  REMIND_BEFORE_DAYS,
  RemindBeforePreset,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import PaymentReminderNotifications from '@models/payment-reminder-notifications.model';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import { Op } from '@sequelize/core';
import * as notificationsService from '@services/notifications';

import { calculateNextDueDate } from './calculate-next-due-date';
import { queueReminderEmail } from './email-queue';

interface CheckResult {
  totalChecked: number;
  overdueUpdated: number;
  notificationsSent: number;
  emailsQueued: number;
  periodsCreated: number;
  errors: number;
}

/**
 * Main function called by the cron job.
 * 1. Updates upcoming periods that are now overdue
 * 2. Creates next periods for overdue recurring reminders that don't have one
 * 3. Sends "remind before" notifications for upcoming periods
 */
export async function checkPaymentReminders(): Promise<CheckResult> {
  const result: CheckResult = {
    totalChecked: 0,
    overdueUpdated: 0,
    notificationsSent: 0,
    emailsQueued: 0,
    periodsCreated: 0,
    errors: 0,
  };

  // 1. Mark overdue periods
  const overdueCount = await markOverduePeriods();
  result.overdueUpdated = overdueCount;

  // 2. Create next periods for recurring reminders that have no upcoming period
  const { created, errors: periodErrors } = await createMissingNextPeriods();
  result.periodsCreated = created;
  result.errors += periodErrors;

  // 3. Send remind-before notifications
  const notifResult = await sendRemindBeforeNotifications();
  result.totalChecked = notifResult.checked;
  result.notificationsSent = notifResult.sent;
  result.emailsQueued = notifResult.emailsQueued;
  result.errors += notifResult.errors;

  return result;
}

/**
 * Find all upcoming periods whose due date has passed and mark them overdue.
 */
async function markOverduePeriods(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]!;

  const [updatedCount] = await PaymentReminderPeriods.update(
    { status: PAYMENT_REMINDER_STATUSES.overdue },
    {
      where: {
        status: PAYMENT_REMINDER_STATUSES.upcoming,
        dueDate: { [Op.lt]: today },
      },
    },
  );

  if (updatedCount > 0) {
    logger.info(`[Payment Reminders] Marked ${updatedCount} periods as overdue`);
  }

  return updatedCount;
}

/**
 * For recurring reminders that have overdue periods but no upcoming period,
 * create the next one.
 */
async function createMissingNextPeriods(): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;

  const activeReminders = await PaymentReminders.findAll({
    where: { isActive: true, frequency: { [Op.ne]: null } },
    attributes: ['id', 'frequency', 'anchorDay'],
  });

  for (const reminder of activeReminders) {
    try {
      const hasUpcoming = await PaymentReminderPeriods.findOne({
        where: {
          reminderId: reminder.id,
          status: PAYMENT_REMINDER_STATUSES.upcoming,
        },
        attributes: ['id'],
      });

      if (hasUpcoming) continue;

      // Find the latest period to calculate the next due date
      const latestPeriod = await PaymentReminderPeriods.findOne({
        where: { reminderId: reminder.id },
        order: [['dueDate', 'DESC']],
        attributes: ['dueDate'],
      });

      if (!latestPeriod || !reminder.frequency) continue;

      const nextDueDate = calculateNextDueDate({
        currentDueDate: latestPeriod.dueDate,
        frequency: reminder.frequency,
        anchorDay: reminder.anchorDay,
      });

      await PaymentReminderPeriods.create({
        reminderId: reminder.id,
        dueDate: nextDueDate,
        status: PAYMENT_REMINDER_STATUSES.upcoming,
      });

      created++;
    } catch (error) {
      errors++;
      logger.error({
        message: `[Payment Reminders] Error creating next period for reminder ${reminder.id}`,
        error: error as Error,
      });
    }
  }

  if (created > 0) {
    logger.info(`[Payment Reminders] Created ${created} missing next periods`);
  }

  return { created, errors };
}

/**
 * Check upcoming periods against their reminder's remindBefore presets
 * and send notifications that haven't been sent yet.
 */
async function sendRemindBeforeNotifications(): Promise<{
  checked: number;
  sent: number;
  emailsQueued: number;
  errors: number;
}> {
  let checked = 0;
  let sent = 0;
  let emailsQueued = 0;
  let errors = 0;

  const today = new Date().toISOString().split('T')[0]!;

  // Get all active reminders that have remind-before presets configured
  const reminders = await PaymentReminders.findAll({
    where: {
      isActive: true,
      remindBefore: { [Op.ne]: [] },
    },
    include: [
      {
        model: PaymentReminderPeriods,
        as: 'periods',
        where: { status: PAYMENT_REMINDER_STATUSES.upcoming },
        required: true,
      },
    ],
  });

  for (const reminder of reminders) {
    for (const period of reminder.periods!) {
      checked++;

      for (const preset of reminder.remindBefore) {
        try {
          const daysBeforeDue = REMIND_BEFORE_DAYS[preset as RemindBeforePreset];
          if (daysBeforeDue === undefined) continue;

          // Calculate when this notification should fire
          const dueDate = new Date(period.dueDate + 'T00:00:00Z');
          const triggerDate = new Date(dueDate);
          triggerDate.setUTCDate(triggerDate.getUTCDate() - daysBeforeDue);
          const triggerDateStr = triggerDate.toISOString().split('T')[0]!;

          // Should we trigger? Only if today >= trigger date
          if (today < triggerDateStr) continue;

          // Check if already sent
          const alreadySent = await PaymentReminderNotifications.findOne({
            where: {
              periodId: period.id,
              remindBeforePreset: preset,
            },
            attributes: ['id'],
          });

          if (alreadySent) continue;

          const amountValue = Money.isMoney(reminder.expectedAmount)
            ? reminder.expectedAmount.toNumber()
            : reminder.expectedAmount;

          // Create in-app notification
          await notificationsService.createNotification({
            userId: reminder.userId,
            type: NOTIFICATION_TYPES.paymentReminder,
            title: `Payment reminder: ${reminder.name}`,
            message: `"${reminder.name}" is due on ${period.dueDate}`,
            payload: {
              reminderId: reminder.id,
              periodId: period.id,
              dueDate: period.dueDate,
              preset,
              expectedAmount: amountValue,
              currencyCode: reminder.currencyCode,
            },
          });

          // Record that this notification was sent
          let emailSent = false;
          let emailError: string | null = null;

          // Queue email if enabled
          if (reminder.notifyEmail) {
            try {
              await queueReminderEmail({
                userId: reminder.userId,
                reminderId: reminder.id,
                periodId: period.id,
                reminderName: reminder.name,
                dueDate: period.dueDate,
                expectedAmount: amountValue,
                currencyCode: reminder.currencyCode,
              });
              emailSent = true;
              emailsQueued++;
            } catch (err) {
              emailError = (err as Error).message;
              logger.error({
                message: `[Payment Reminders] Failed to queue email for reminder ${reminder.id}`,
                error: err as Error,
              });
            }
          }

          await PaymentReminderNotifications.create({
            periodId: period.id,
            remindBeforePreset: preset,
            emailSent,
            emailError,
          });

          sent++;
        } catch (error) {
          errors++;
          logger.error({
            message: `[Payment Reminders] Error processing notification for period ${period.id}, preset ${preset}`,
            error: error as Error,
          });
        }
      }
    }
  }

  if (sent > 0) {
    logger.info(`[Payment Reminders] Sent ${sent} notifications, queued ${emailsQueued} emails`);
  }

  return { checked, sent, emailsQueued, errors };
}
