import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ConflictError } from '@js/errors';
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

  if (period.status === PAYMENT_REMINDER_STATUSES.paid) {
    throw new ConflictError({ message: t({ key: 'paymentReminders.cannotSkipPaidPeriod' }) });
  }

  if (period.status === PAYMENT_REMINDER_STATUSES.skipped) {
    throw new ConflictError({ message: t({ key: 'paymentReminders.periodAlreadySkipped' }) });
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
