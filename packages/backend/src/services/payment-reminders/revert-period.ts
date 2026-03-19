import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import { withTransaction } from '@services/common/with-transaction';

interface RevertPeriodParams {
  userId: number;
  reminderId: string;
  periodId: string;
}

export const revertPeriod = withTransaction(async ({ userId, reminderId, periodId }: RevertPeriodParams) => {
  const reminder = await findOrThrowNotFound({
    query: PaymentReminders.findOne({
      where: { id: reminderId, userId },
    }),
    message: 'Payment reminder not found',
  });

  const period = await findOrThrowNotFound({
    query: PaymentReminderPeriods.findOne({
      where: { id: periodId, reminderId },
    }),
    message: 'Payment reminder period not found',
  });

  if (period.status === PAYMENT_REMINDER_STATUSES.upcoming || period.status === PAYMENT_REMINDER_STATUSES.overdue) {
    throw new ConflictError({ message: 'Period is already in an active state' });
  }

  // Determine correct status based on due date
  const now = new Date();
  const dueDate = new Date(period.dueDate + 'T23:59:59Z');
  const newStatus = dueDate < now ? PAYMENT_REMINDER_STATUSES.overdue : PAYMENT_REMINDER_STATUSES.upcoming;

  // For recurring reminders, remove the auto-created next upcoming period
  // to avoid duplicate active periods
  if (reminder.frequency) {
    const newerUpcoming = await PaymentReminderPeriods.findOne({
      where: {
        reminderId,
        status: PAYMENT_REMINDER_STATUSES.upcoming,
      },
      order: [['dueDate', 'DESC']],
    });

    if (newerUpcoming && newerUpcoming.dueDate > period.dueDate) {
      await newerUpcoming.destroy();
    }
  }

  await period.update({
    status: newStatus,
    paidAt: null,
    transactionId: null,
  });

  return period.reload();
});
