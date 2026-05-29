import { SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import Categories from '@models/categories.model';
import Subscriptions from '@models/subscriptions.model';
import Transactions from '@models/transactions.model';
import { InferAttributes, Op } from '@sequelize/core';

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
      const plain = sub.toJSON() as InferAttributes<Subscriptions> & {
        transactions?: { id: number; time: Date }[];
        category?: { id: number; name: string; color: string } | null;
      };
      const nextPaymentDate = computeNextExpectedDate({
        startDate: plain.startDate,
        frequency: plain.frequency,
        transactions: plain.transactions,
      });

      return {
        subscriptionId: plain.id,
        subscriptionName: plain.name,
        expectedAmount: plain.expectedAmount!.toNumber(),
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
