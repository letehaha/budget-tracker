import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';

import { calculateNextDueDate } from './calculate-next-due-date';

export async function ensureNextPeriodExists({ reminder }: { reminder: PaymentReminders }) {
  if (!reminder.frequency) return;

  const upcomingPeriod = await PaymentReminderPeriods.findOne({
    where: {
      reminderId: reminder.id,
      status: PAYMENT_REMINDER_STATUSES.upcoming,
    },
  });

  if (upcomingPeriod) return;

  const latestPeriod = await PaymentReminderPeriods.findOne({
    where: { reminderId: reminder.id },
    order: [['dueDate', 'DESC']],
  });

  if (!latestPeriod) return;

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
}
