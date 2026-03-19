import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Transactions from '@models/Transactions.model';

interface GetPeriodsParams {
  userId: number;
  reminderId: string;
  limit?: number;
  offset?: number;
}

export async function getPeriods({ userId, reminderId, limit = 6, offset = 0 }: GetPeriodsParams) {
  // Verify reminder belongs to user
  await findOrThrowNotFound({
    query: PaymentReminders.findOne({
      where: { id: reminderId, userId },
      attributes: ['id'],
    }),
    message: 'Payment reminder not found',
  });

  const { rows, count } = await PaymentReminderPeriods.findAndCountAll({
    where: { reminderId },
    include: [
      {
        model: Transactions,
        as: 'transaction',
        attributes: ['id', 'amount', 'note', 'time'],
        required: false,
      },
    ],
    order: [['dueDate', 'DESC']],
    limit,
    offset,
  });

  return { periods: rows, total: count };
}
