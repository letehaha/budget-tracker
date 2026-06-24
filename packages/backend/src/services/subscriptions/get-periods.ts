import SubscriptionPeriods from '@models/subscription-periods.model';
import Transactions from '@models/transactions.model';

import { findSubscriptionOrThrow } from './helpers';

interface GetPeriodsParams {
  userId: number;
  subscriptionId: string;
  limit?: number;
  offset?: number;
}

export async function getPeriods({ userId, subscriptionId, limit = 6, offset = 0 }: GetPeriodsParams) {
  // Verify subscription belongs to user before exposing its periods.
  await findSubscriptionOrThrow({ id: subscriptionId, userId });

  const { rows, count } = await SubscriptionPeriods.findAndCountAll({
    where: { subscriptionId },
    include: [
      {
        model: Transactions,
        as: 'transaction',
        attributes: ['id', 'amount', 'note', 'time'],
        required: false,
      },
    ],
    order: [['dueDate', 'DESC']],
    limit,
    offset,
  });

  return { periods: rows, total: count };
}
