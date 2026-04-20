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

  // Just remove the transaction link, keep the paid status
  await period.update({ transactionId: null });

  return period.reload();
});
