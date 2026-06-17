import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import { withTransaction } from '@services/common/with-transaction';

interface UnlinkTransactionParams {
  userId: number;
  reminderId: string;
  periodId: string;
}

export const unlinkTransaction = withTransaction(async ({ userId, reminderId, periodId }: UnlinkTransactionParams) => {
  await findOrThrowNotFound({
    query: PaymentReminders.findOne({
      where: { id: reminderId, userId },
      attributes: ['id'],
    }),
    message: 'Payment reminder not found',
  });

  const period = await findOrThrowNotFound({
    query: PaymentReminderPeriods.findOne({
      where: { id: periodId, reminderId },
    }),
    message: 'Payment reminder period not found',
  });

  // Detaching is the user explicitly severing the link, so the transaction stays.
  // Clearing transactionAutoCreated keeps the flag honest: with no linked tx there
  // is nothing for revert to delete.
  await period.update({ transactionId: null, transactionAutoCreated: false });

  return period.reload();
});
