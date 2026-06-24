import { SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError, ValidationError } from '@js/errors';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { createTransaction } from '@services/transactions/create-transaction';

import { buildTransactionFromSubscription } from './build-transaction-from-subscription';
import { ensureNextPeriodExists } from './ensure-next-period';
import { findSubscriptionOrThrow, validateAccountOwnership } from './helpers';

interface MarkPeriodPaidParams {
  userId: number;
  subscriptionId: string;
  periodId: string;
  /** Link an already-existing transaction. Mutually exclusive with `createTransaction`. */
  transactionId?: string | null;
  notes?: string | null;
  /** Create the expense transaction from the subscription and link it to this period. */
  createTransaction?: boolean;
  /** Decimal override for the created transaction's amount. Falls back to the subscription's expectedAmount. */
  amount?: number;
  /** Actual payment date for the created transaction. Falls back to now. */
  time?: Date;
  /**
   * Account to book the created transaction against. When supplied for an
   * account-less subscription it is also persisted onto the subscription, so the
   * booked expense and every future payment reuse it (the user picks an account
   * once, at the first pay, rather than every cycle).
   */
  accountId?: string | null;
}

export const markPeriodPaid = withTransaction(
  async ({
    userId,
    subscriptionId,
    periodId,
    transactionId = null,
    notes = null,
    createTransaction: shouldCreateTransaction = false,
    amount,
    time,
    accountId,
  }: MarkPeriodPaidParams) => {
    const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

    const period = await findOrThrowNotFound({
      query: SubscriptionPeriods.findOne({
        where: { id: periodId, subscriptionId },
      }),
      message: 'Subscription period not found.',
    });

    if (period.status === SUBSCRIPTION_PERIOD_STATUSES.paid) {
      throw new ConflictError({ message: 'This period is already paid.' });
    }

    if (period.status === SUBSCRIPTION_PERIOD_STATUSES.skipped) {
      throw new ConflictError({ message: 'This period was skipped — undo the skip first.' });
    }

    // Pay-time account selection: an account-less subscription can name an account
    // when booking this payment. Persist it onto the subscription (same active
    // transaction as the period update below) so the booked expense reads it and
    // future payments default to it. No-op when it already matches.
    if (accountId != null && accountId !== subscription.accountId) {
      await validateAccountOwnership({ accountId, userId });
      await subscription.update({ accountId });
    }

    // Resolve the transaction to link: either the caller's existing one, or a
    // freshly created expense booked against the subscription's account. Both
    // paths converge on `linkedTransactionId`.
    let linkedTransactionId: string | null = transactionId;

    if (shouldCreateTransaction) {
      // Validation (account/amount presence) happens inside the builder so the
      // request fails before any transaction row is written.
      const createParams = await buildTransactionFromSubscription({ subscription, amount, time });
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
        message: 'Transaction not found.',
      });

      // A transaction is one real payment, so it may back only one period. Scope
      // the lookup by transactionId alone (across every subscription): linking it
      // to a second period would let reverting one delete the shared row and
      // FK-SET-NULL the sibling, leaving that period paid but detached.
      const existingLink = await SubscriptionPeriods.findOne({
        where: { transactionId },
      });

      if (existingLink) {
        throw new ValidationError({
          message: 'This transaction is already linked to another subscription period.',
        });
      }
    }

    await period.update({
      status: SUBSCRIPTION_PERIOD_STATUSES.paid,
      // Stamp the paid date with the booked transaction's date so a backdated
      // payment reads as paid on `time`, not today. Falls back to now when the
      // caller gives no time (e.g. a plain mark-paid).
      paidAt: time ?? new Date(),
      transactionId: linkedTransactionId,
      // Only a transaction the app just generated (CREATE-mode) is app-owned and
      // safe to delete on revert. A user-linked transaction (LINK-mode) or a
      // plain mark-paid leaves this false so revert never deletes the user's row.
      transactionAutoCreated: shouldCreateTransaction,
      notes: notes ?? period.notes,
    });

    // Ensure the next upcoming period exists so the schedule continues.
    await ensureNextPeriodExists({ subscription });

    return period.reload();
  },
);
