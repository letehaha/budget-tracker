import { NotFoundError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import { withTransaction } from '@services/common/with-transaction';

interface UnlinkTransactionParams {
  userId: number;
  reminderId: string;
  periodId: string;
}

export const unlinkTransaction = withTransaction(async ({ userId, reminderId, periodId }: UnlinkTransactionParams) => {
  const reminder = await PaymentReminders.findOne({
    where: { id: reminderId, userId },
    attributes: ['id'],
  });

  if (!reminder) {
    throw new NotFoundError({ message: 'Payment reminder not found' });
  }

  const period = await PaymentReminderPeriods.findOne({
    where: { id: periodId, reminderId },
  });

  if (!period) {
    throw new NotFoundError({ message: 'Payment reminder period not found' });
  }

  // Just remove the transaction link, keep the paid status
  await period.update({ transactionId: null });

  return period.reload();
});
