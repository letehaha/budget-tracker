import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ConflictError, NotFoundError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import { withTransaction } from '@services/common/with-transaction';
import { deleteTransaction } from '@services/transactions/delete-transaction';

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
    message: t({ key: 'paymentReminders.reminderNotFound' }),
  });

  const period = await findOrThrowNotFound({
    query: PaymentReminderPeriods.findOne({
      where: { id: periodId, reminderId },
    }),
    message: t({ key: 'paymentReminders.periodNotFound' }),
  });

  if (period.status === PAYMENT_REMINDER_STATUSES.upcoming || period.status === PAYMENT_REMINDER_STATUSES.overdue) {
    throw new ConflictError({ message: t({ key: 'paymentReminders.periodAlreadyActive' }) });
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

  // An app-generated transaction (CREATE-mode pay) is owned by this period: undoing
  // the payment must delete it so the expense it booked is reversed and the account
  // balance returns to its pre-payment value. A user-linked transaction
  // (transactionAutoCreated === false) is never deleted — the user keeps their own
  // row, the period just stops pointing at it.
  if (period.transactionId != null && period.transactionAutoCreated) {
    try {
      // deleteTransaction joins the active transaction via `withTransaction`, so the
      // balance reversal commits/rolls back together with the period update below.
      await deleteTransaction({ id: period.transactionId, userId });
    } catch (error) {
      // The user may have already deleted the generated transaction by hand (its
      // balance is then already restored). Treat that as a no-op and clear the link;
      // surface anything else.
      if (!(error instanceof NotFoundError)) {
        throw error;
      }
    }
  }

  await period.update({
    status: newStatus,
    paidAt: null,
    transactionId: null,
    transactionAutoCreated: false,
  });

  // Reverting re-opens an active (upcoming/overdue) period. If the reminder was
  // auto-deactivated because its installment cap (maxOccurrences) was consumed,
  // that period is no longer terminal, so the schedule needs servicing again —
  // reactivate it. Only relevant for recurring reminders; one-off reminders
  // intentionally stay as-is.
  if (reminder.frequency && !reminder.isActive) {
    await reminder.update({ isActive: true });
  }

  return period.reload();
});
