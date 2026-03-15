import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import { withTransaction } from '@services/common/with-transaction';

import { ensureNextPeriodExists } from './ensure-next-period';

interface SkipPeriodParams {
  userId: number;
  reminderId: string;
  periodId: string;
}

export const skipPeriod = withTransaction(async ({ userId, reminderId, periodId }: SkipPeriodParams) => {
  const reminder = await PaymentReminders.findOne({
    where: { id: reminderId, userId },
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

  if (period.status === PAYMENT_REMINDER_STATUSES.paid) {
    throw new ConflictError({ message: 'Cannot skip a paid period' });
  }

  if (period.status === PAYMENT_REMINDER_STATUSES.skipped) {
    throw new ConflictError({ message: 'Period is already skipped' });
  }

  await period.update({
    status: PAYMENT_REMINDER_STATUSES.skipped,
  });

  // If recurring, ensure next period exists
  if (reminder.frequency) {
    await ensureNextPeriodExists({ reminder });
  }

  return period.reload();
});
