import { SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_PERIOD_STATUSES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import Categories from '@models/categories.model';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { computeNextExpectedDate } from './get-subscriptions';

interface GetUpcomingPaymentsParams {
  userId: number;
  limit?: number;
  type?: SUBSCRIPTION_TYPES;
}

export const getUpcomingPayments = async ({ userId, limit = 5, type }: GetUpcomingPaymentsParams) => {
  const where: Record<string, unknown> = {
    userId,
    isActive: true,
    expectedAmount: { [Op.ne]: null },
  };
  if (type) where.type = type;

  const subscriptions = await Subscriptions.findAll({
    where,
    include: [
      { model: Categories, attributes: ['id', 'name', 'color'] },
      {
        model: Transactions,
        through: {
          attributes: [],
          where: { status: SUBSCRIPTION_LINK_STATUS.active },
        },
        attributes: ['id', 'time'],
      },
      {
        model: SubscriptionPeriods,
        where: {
          status: { [Op.in]: [SUBSCRIPTION_PERIOD_STATUSES.upcoming, SUBSCRIPTION_PERIOD_STATUSES.overdue] },
        },
        required: false,
        separate: true,
        order: [['dueDate', 'ASC']],
        limit: 1,
      },
    ],
  });

  return subscriptions
    .map((sub) => {
      const plain = sub.toJSON();
      // Prefer the earliest open period's dueDate (period-payments engine).
      // Fall back to derived date for legacy subscriptions with no open period.
      const earliestOpenPeriod = plain.periods?.[0];
      const nextPaymentDate = earliestOpenPeriod
        ? earliestOpenPeriod.dueDate
        : computeNextExpectedDate({
            startDate: plain.startDate,
            frequency: plain.frequency,
            transactions: plain.transactions,
          });

      return {
        subscriptionId: plain.id,
        subscriptionName: plain.name,
        logoDomain: plain.logoDomain ?? null,
        expectedAmount: Money.fromCents(plain.expectedAmount!).toNumber(),
        expectedCurrencyCode: plain.expectedCurrencyCode,
        nextPaymentDate,
        frequency: plain.frequency,
        categoryName: plain.category?.name ?? null,
        categoryColor: plain.category?.color ?? null,
      };
    })
    .toSorted((a, b) => {
      if (!a.nextPaymentDate) return 1;
      if (!b.nextPaymentDate) return -1;
      return a.nextPaymentDate.localeCompare(b.nextPaymentDate);
    })
    .slice(0, limit);
};
