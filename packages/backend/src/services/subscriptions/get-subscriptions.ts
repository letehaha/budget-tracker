import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_LINK_STATUS, asCents, toDecimal } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Categories from '@models/Categories.model';
import Subscriptions from '@models/Subscriptions.model';
import Transactions from '@models/Transactions.model';
import { addMonths, addWeeks, addYears, max, parseISO } from 'date-fns';
import { fn, literal } from 'sequelize';

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
      expectedAmount: plain.expectedAmount !== null ? toDecimal(asCents(plain.expectedAmount)) : null,
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
    expectedAmount: raw.expectedAmount !== null ? toDecimal(asCents(raw.expectedAmount)) : null,
  };
  const nextExpectedDate = computeNextExpectedDate({
    startDate: plain.startDate,
    frequency: plain.frequency,
    transactions: plain.transactions,
  });

  // Convert transaction amounts from cents to decimals
  const serializedTransactions = (plain.transactions ?? []).map((tx: Record<string, unknown>) => ({
    ...tx,
    amount: toDecimal(asCents(tx.amount as number)),
    refAmount: toDecimal(asCents(tx.refAmount as number)),
    commissionRate: toDecimal(asCents(tx.commissionRate as number)),
    refCommissionRate: toDecimal(asCents(tx.refCommissionRate as number)),
    cashbackAmount: toDecimal(asCents(tx.cashbackAmount as number)),
  }));

  return { ...plain, transactions: serializedTransactions, nextExpectedDate };
};

export const computeNextExpectedDate = ({
  startDate,
  frequency,
  transactions,
}: {
  startDate: string;
  frequency: SUBSCRIPTION_FREQUENCIES;
  transactions?: Array<{ time?: Date | string }>;
}): string | null => {
  const start = parseISO(startDate);
  const now = new Date();

  // Find the latest linked transaction date
  let lastDate = start;
  if (transactions && transactions.length > 0) {
    const txDates = transactions.map((tx) => (tx.time ? new Date(tx.time) : null)).filter((d): d is Date => d !== null);

    if (txDates.length > 0) {
      lastDate = max(txDates);
    }
  }

  // Advance from lastDate by frequency until we get a future date
  let next = addFrequency({ date: lastDate, frequency });

  // If the computed next date is still in the past, keep advancing
  while (next < now) {
    next = addFrequency({ date: next, frequency });
  }

  return next.toISOString().split('T')[0]!;
};

const addFrequency = ({ date, frequency }: { date: Date; frequency: SUBSCRIPTION_FREQUENCIES }): Date => {
  switch (frequency) {
    case SUBSCRIPTION_FREQUENCIES.weekly:
      return addWeeks(date, 1);
    case SUBSCRIPTION_FREQUENCIES.biweekly:
      return addWeeks(date, 2);
    case SUBSCRIPTION_FREQUENCIES.monthly:
      return addMonths(date, 1);
    case SUBSCRIPTION_FREQUENCIES.quarterly:
      return addMonths(date, 3);
    case SUBSCRIPTION_FREQUENCIES.semiAnnual:
      return addMonths(date, 6);
    case SUBSCRIPTION_FREQUENCIES.annual:
      return addYears(date, 1);
    default:
      return addMonths(date, 1);
  }
};
