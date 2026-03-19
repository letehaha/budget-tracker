import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ConflictError, ValidationError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';

import { ensureNextPeriodExists } from './ensure-next-period';

interface MarkPeriodPaidParams {
  userId: number;
  reminderId: string;
  periodId: string;
  transactionId?: number | null;
  notes?: string | null;
}

export const markPeriodPaid = withTransaction(
  async ({ userId, reminderId, periodId, transactionId = null, notes = null }: MarkPeriodPaidParams) => {
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
      throw new ConflictError({ message: t({ key: 'paymentReminders.periodAlreadyPaid' }) });
    }

    if (period.status === PAYMENT_REMINDER_STATUSES.skipped) {
      throw new ConflictError({ message: t({ key: 'paymentReminders.periodSkippedUndoFirst' }) });
    }

    // Validate transaction if provided
    if (transactionId != null) {
      await findOrThrowNotFound({
        query: Transactions.findOne({
          where: { id: transactionId, userId },
        }),
        message: t({ key: 'transactions.notFound' }),
      });

      // Check if this transaction is already linked to another period of THIS reminder
      const existingLink = await PaymentReminderPeriods.findOne({
        where: { reminderId, transactionId },
      });

      if (existingLink) {
        throw new ValidationError({
          message: t({ key: 'paymentReminders.transactionAlreadyLinkedToPeriod' }),
        });
      }
    }

    await period.update({
      status: PAYMENT_REMINDER_STATUSES.paid,
      paidAt: new Date(),
      transactionId,
      notes: notes ?? period.notes,
    });

    // If recurring, ensure next period exists
    if (reminder.frequency) {
      await ensureNextPeriodExists({ reminder });
    }

    return period.reload();
  },
);
