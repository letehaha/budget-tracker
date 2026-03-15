import { NotFoundError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Subscriptions from '@models/subscriptions.model';

interface GetReminderByIdParams {
  userId: number;
  id: string;
}

export async function getReminderById({ userId, id }: GetReminderByIdParams) {
  const reminder = await PaymentReminders.findOne({
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
  });

  if (!reminder) {
    throw new NotFoundError({ message: 'Payment reminder not found' });
  }

  return reminder;
}
