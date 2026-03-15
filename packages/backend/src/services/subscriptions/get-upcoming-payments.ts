import { SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import Categories from '@models/Categories.model';
import Subscriptions from '@models/Subscriptions.model';
import Transactions from '@models/Transactions.model';
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
    ],
  });

  return subscriptions
    .map((sub) => {
      const plain = sub.toJSON();
      const nextPaymentDate = computeNextExpectedDate({
        startDate: plain.startDate,
        frequency: plain.frequency,
        transactions: plain.transactions,
      });

      return {
        subscriptionId: plain.id,
        subscriptionName: plain.name,
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
