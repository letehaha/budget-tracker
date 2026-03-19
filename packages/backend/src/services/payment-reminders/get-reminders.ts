import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Subscriptions from '@models/subscriptions.model';

interface GetRemindersParams {
  userId: number;
  includeInactive?: boolean;
}

export async function getReminders({ userId, includeInactive = false }: GetRemindersParams) {
  const where: Record<string, unknown> = { userId };

  if (!includeInactive) {
    where.isActive = true;
  }

  return PaymentReminders.findAll({
    where,
    include: [
      {
        model: PaymentReminderPeriods,
        as: 'periods',
        where: {
          status: [PAYMENT_REMINDER_STATUSES.upcoming, PAYMENT_REMINDER_STATUSES.overdue],
        },
        required: false,
        limit: 5,
        order: [['dueDate', 'ASC']],
      },
      {
        model: Subscriptions,
        as: 'subscription',
        attributes: ['id', 'name'],
        required: false,
      },
    ],
    order: [['createdAt', 'DESC']],
  });
}
