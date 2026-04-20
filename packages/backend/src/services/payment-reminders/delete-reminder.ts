import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import PaymentReminders from '@models/payment-reminders.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteReminderParams {
  userId: number;
  id: string;
}

export const deleteReminder = withTransaction(async ({ userId, id }: DeleteReminderParams) => {
  const reminder = await findOrThrowNotFound({
    query: PaymentReminders.findOne({
      where: { id, userId },
    }),
    message: 'Payment reminder not found',
  });

  // CASCADE delete will clean up periods and notifications
  await reminder.destroy();

  return { success: true };
});
