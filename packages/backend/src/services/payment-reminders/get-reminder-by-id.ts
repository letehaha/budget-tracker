import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Subscriptions from '@models/Subscriptions.model';

interface GetReminderByIdParams {
  userId: number;
  id: string;
}

export async function getReminderById({ userId, id }: GetReminderByIdParams) {
  const reminder = await findOrThrowNotFound({
    query: PaymentReminders.findOne({
      where: { id, userId },
      include: [
        {
          model: PaymentReminderPeriods,
          as: 'periods',
          order: [['dueDate', 'ASC']],
        },
        {
          model: Subscriptions,
          as: 'subscription',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [[{ model: PaymentReminderPeriods, as: 'periods' }, 'dueDate', 'ASC']],
    }),
    message: 'Payment reminder not found',
  });

  return reminder;
}
