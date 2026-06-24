import { SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError, NotFoundError } from '@js/errors';
import SubscriptionPeriods from '@models/subscription-periods.model';
import { withTransaction } from '@services/common/with-transaction';
import { deleteTransaction } from '@services/transactions/delete-transaction';
import { Op } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

interface RevertPeriodParams {
  userId: number;
  subscriptionId: string;
  periodId: string;
}

export const revertPeriod = withTransaction(async ({ userId, subscriptionId, periodId }: RevertPeriodParams) => {
  // Validates the subscription exists and belongs to the user (throws 404 otherwise).
  await findSubscriptionOrThrow({ id: subscriptionId, userId });

  const period = await findOrThrowNotFound({
    query: SubscriptionPeriods.findOne({
      where: { id: periodId, subscriptionId },
    }),
    message: 'Subscription period not found.',
  });

  if (
    period.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming ||
    period.status === SUBSCRIPTION_PERIOD_STATUSES.overdue
  ) {
    throw new ConflictError({ message: 'This period is already active.' });
  }

  // Determine correct status based on due date: overdue if the due date has
  // already passed (treating the whole due day as valid), otherwise upcoming.
  const now = new Date();
  const dueDate = new Date(period.dueDate + 'T23:59:59Z');
  const newStatus = dueDate < now ? SUBSCRIPTION_PERIOD_STATUSES.overdue : SUBSCRIPTION_PERIOD_STATUSES.upcoming;

  // Remove the auto-created next upcoming period to avoid a duplicate active
  // period once this one is re-opened. That successor belongs to the LATEST
  // consumed period: if any paid or skipped period sits after this one (greater
  // dueDate), the current upcoming follows that later period, so reverting this
  // earlier one must leave the upcoming untouched. dueDate is a DATEONLY
  // 'YYYY-MM-DD' string, so Op.gt compares chronologically and strict `>`
  // excludes the reverted period itself.
  const laterConsumedPeriod = await SubscriptionPeriods.findOne({
    where: {
      subscriptionId,
      status: [SUBSCRIPTION_PERIOD_STATUSES.paid, SUBSCRIPTION_PERIOD_STATUSES.skipped],
      dueDate: { [Op.gt]: period.dueDate },
    },
  });

  if (!laterConsumedPeriod) {
    const newerUpcoming = await SubscriptionPeriods.findOne({
      where: {
        subscriptionId,
        status: SUBSCRIPTION_PERIOD_STATUSES.upcoming,
      },
      order: [['dueDate', 'DESC']],
    });

    if (newerUpcoming && newerUpcoming.dueDate > period.dueDate) {
      await newerUpcoming.destroy();
    }
  }

  // An app-generated transaction (CREATE-mode pay) is owned by this period: undoing
  // the payment must delete it so the expense it booked is reversed and the account
  // balance returns to its pre-payment value. A user-linked transaction
  // (transactionAutoCreated === false) is never deleted — the user keeps their own
  // row, the period just stops pointing at it.
  if (period.transactionId != null && period.transactionAutoCreated) {
    try {
      // deleteTransaction joins the active transaction via `withTransaction`, so the
      // balance reversal commits/rolls back together with the period update below.
      await deleteTransaction({ id: period.transactionId, userId });
    } catch (error) {
      // The user may have already deleted the generated transaction by hand (its
      // balance is then already restored). Treat that as a no-op and clear the link;
      // surface anything else.
      if (!(error instanceof NotFoundError)) {
        throw error;
      }
    }
  }

  await period.update({
    status: newStatus,
    paidAt: null,
    transactionId: null,
    transactionAutoCreated: false,
  });

  // NOTE: isActive-reactivation is intentionally absent here.
  // On subscriptions, isActive is the user's manual pause/resume toggle.
  // Reverting a period must never auto-resume a subscription the user paused.

  return period.reload();
});
