import { SUBSCRIPTION_LINK_STATUS } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Categories from '@models/Categories.model';
import Subscriptions from '@models/Subscriptions.model';
import Transactions from '@models/Transactions.model';
import { fn, literal } from 'sequelize';

import { computeNextExpectedDate } from './subscription-date.utils';

export { computeNextExpectedDate };

export interface GetSubscriptionsParams {
  userId: number;
  isActive?: boolean;
  type?: string;
}

export const getSubscriptions = async ({ userId, isActive, type }: GetSubscriptionsParams) => {
  const where: Record<string, unknown> = { userId };
  if (isActive !== undefined) where.isActive = isActive;
  if (type) where.type = type;

  const subscriptions = await Subscriptions.findAll({
    where,
    attributes: {
      include: [
        [
          fn(
            'COUNT',
            literal(
              `CASE WHEN "transactions->SubscriptionTransactions"."status" = '${SUBSCRIPTION_LINK_STATUS.active}' THEN "transactions"."id" END`,
            ),
          ),
          'linkedTransactionsCount',
        ],
      ],
    },
    include: [
      { model: Accounts, attributes: ['id', 'name', 'currencyCode'] },
      { model: Categories, attributes: ['id', 'name', 'color', 'icon'] },
      {
        model: Transactions,
        attributes: [],
        through: { attributes: [] },
      },
    ],
    group: ['Subscriptions.id', 'account.id', 'category.id'],
    order: [['createdAt', 'DESC']],
    subQuery: false,
  });

  return subscriptions.map((s) => {
    const plain = s.toJSON();
    return {
      ...plain,
      expectedAmount: plain.expectedAmount !== null ? Money.fromCents(plain.expectedAmount).toNumber() : null,
      linkedTransactionsCount: Number((plain as Record<string, unknown>).linkedTransactionsCount ?? 0),
    };
  });
};

export const getSubscriptionById = async ({ id, userId }: { id: string; userId: number }) => {
  const subscription = await Subscriptions.findOne({
    where: { id, userId },
    include: [
      { model: Accounts, attributes: ['id', 'name', 'currencyCode'] },
      { model: Categories, attributes: ['id', 'name', 'color', 'icon'] },
      {
        model: Transactions,
        through: {
          attributes: ['matchSource', 'matchedAt', 'status'],
          where: { status: SUBSCRIPTION_LINK_STATUS.active },
        },
      },
    ],
  });

  if (!subscription) {
    throw new NotFoundError({ message: 'Subscription not found.' });
  }

  const raw = subscription.toJSON();
  const plain = {
    ...raw,
    expectedAmount: raw.expectedAmount !== null ? Money.fromCents(raw.expectedAmount).toNumber() : null,
  };
  const nextExpectedDate = computeNextExpectedDate({
    startDate: plain.startDate,
    frequency: plain.frequency,
    transactions: plain.transactions,
  });

  // Convert transaction Money instances to numbers for API response
  const serializedTransactions = (plain.transactions ?? []).map((tx: Record<string, unknown>) => ({
    ...tx,
    amount: (tx.amount as Money).toNumber(),
    refAmount: (tx.refAmount as Money).toNumber(),
    commissionRate: (tx.commissionRate as Money).toNumber(),
    refCommissionRate: (tx.refCommissionRate as Money).toNumber(),
    cashbackAmount: (tx.cashbackAmount as Money).toNumber(),
  }));

  return { ...plain, transactions: serializedTransactions, nextExpectedDate };
};
