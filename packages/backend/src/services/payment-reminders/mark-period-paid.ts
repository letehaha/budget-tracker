import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ConflictError, ValidationError } from '@js/errors';
import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';
import Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { createTransaction } from '@services/transactions/create-transaction';

import { buildTransactionFromReminder } from './build-transaction-from-reminder';
import { ensureNextPeriodExists } from './ensure-next-period';

interface MarkPeriodPaidParams {
  userId: number;
  reminderId: string;
  periodId: string;
  /** Link an already-existing transaction. Mutually exclusive with `createTransaction`. */
  transactionId?: string | null;
  notes?: string | null;
  /** Create the expense transaction from the reminder and link it to this period. */
  createTransaction?: boolean;
  /** Decimal override for the created transaction's amount. Falls back to the reminder's expectedAmount. */
  amount?: number;
  /** Actual payment date for the created transaction. Falls back to now. */
  time?: Date;
}

export const markPeriodPaid = withTransaction(
  async ({
    userId,
    reminderId,
    periodId,
    transactionId = null,
    notes = null,
    createTransaction: shouldCreateTransaction = false,
    amount,
    time,
  }: MarkPeriodPaidParams) => {
    // Create-mode and link-mode are mutually exclusive: one creates the expense
    // and links it, the other links a transaction that already exists.
    if (shouldCreateTransaction && transactionId != null) {
      throw new ValidationError({
        message: t({ key: 'paymentReminders.createAndLinkMutuallyExclusive' }),
      });
    }

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

    // Resolve the transaction to link: either the caller's existing one, or a
    // freshly created expense booked against the reminder's account. Both paths
    // converge on `linkedTransactionId`.
    let linkedTransactionId: string | null = transactionId;

    if (shouldCreateTransaction) {
      // Validation (account/amount presence) happens inside the builder so the
      // request fails before any transaction row is written.
      const createParams = await buildTransactionFromReminder({ reminder, amount, time });
      // createTransaction joins the active transaction via `withTransaction`, so
      // the created tx rolls back with the period update if anything below throws.
      const [createdBaseTx] = await createTransaction(createParams);
      linkedTransactionId = createdBaseTx.id;
    } else if (transactionId != null) {
      // Validate the caller-supplied transaction.
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
      transactionId: linkedTransactionId,
      // Only a transaction the app just generated (CREATE-mode) is app-owned and
      // safe to delete on revert. A user-linked transaction (LINK-mode) or a
      // plain mark-paid leaves this false so revert never deletes the user's row.
      transactionAutoCreated: shouldCreateTransaction,
      notes: notes ?? period.notes,
    });

    // If recurring, ensure next period exists
    if (reminder.frequency) {
      await ensureNextPeriodExists({ reminder });
    }

    return period.reload();
  },
);
