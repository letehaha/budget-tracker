import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Transactions from '@models/Transactions.model';
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
      throw new ConflictError({ message: 'Period is already marked as paid' });
    }

    if (period.status === PAYMENT_REMINDER_STATUSES.skipped) {
      throw new ConflictError({ message: 'Period is skipped. Undo skip before marking as paid.' });
    }

    // Validate transaction if provided
    if (transactionId != null) {
      const transaction = await Transactions.findOne({
        where: { id: transactionId, userId },
      });

      if (!transaction) {
        throw new NotFoundError({ message: 'Transaction not found' });
      }

      // Check if this transaction is already linked to another period of THIS reminder
      const existingLink = await PaymentReminderPeriods.findOne({
        where: { reminderId, transactionId },
      });

      if (existingLink) {
        throw new ValidationError({
          message: 'This transaction is already linked to another period of this reminder',
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
