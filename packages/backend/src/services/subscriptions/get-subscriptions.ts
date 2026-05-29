import { SUBSCRIPTION_LINK_STATUS } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import SubscriptionTransactions from '@models/subscription-transactions.model';
import Subscriptions from '@models/subscriptions.model';
import Transactions, { type TransactionsAttributes } from '@models/transactions.model';
import { fn, literal } from 'sequelize';

import { computeNextExpectedDate } from './subscription-date.utils';

export { computeNextExpectedDate };

interface GetSubscriptionsParams {
  userId: number;
  isActive?: boolean;
  type?: string;
}

// The included associations are loaded with trimmed attribute sets.
type SubscriptionAccount = Pick<Accounts, 'id' | 'name' | 'currencyCode'>;
type SubscriptionCategory = Pick<Categories, 'id' | 'name' | 'color' | 'icon'>;

/**
 * Subscription scalar columns plus its trimmed account/category associations.
 * `expectedAmount` is a BIGINT (cents) on the model but is surfaced here as a
 * decimal number — the type stays `number | null`, only the value changes.
 */
interface SubscriptionBase extends Pick<
  Subscriptions,
  | 'id'
  | 'userId'
  | 'name'
  | 'type'
  | 'expectedAmount'
  | 'expectedCurrencyCode'
  | 'frequency'
  | 'startDate'
  | 'endDate'
  | 'accountId'
  | 'categoryId'
  | 'matchingRules'
  | 'isActive'
  | 'notes'
  | 'createdAt'
  | 'updatedAt'
> {
  account: SubscriptionAccount | null;
  category: SubscriptionCategory | null;
}

interface SubscriptionListItem extends SubscriptionBase {
  linkedTransactionsCount: number;
}

/**
 * A linked transaction: the full transaction columns with Money fields surfaced
 * as decimal numbers, plus the join-table match metadata.
 */
interface SubscriptionLinkedTransaction extends Omit<
  TransactionsAttributes,
  'amount' | 'refAmount' | 'commissionRate' | 'refCommissionRate' | 'cashbackAmount'
> {
  amount: number;
  refAmount: number;
  commissionRate: number;
  refCommissionRate: number;
  cashbackAmount: number;
  SubscriptionTransactions: Pick<SubscriptionTransactions, 'matchSource' | 'matchedAt' | 'status'>;
}

interface SubscriptionDetail extends SubscriptionBase {
  transactions: SubscriptionLinkedTransaction[];
  nextExpectedDate: string | null;
}

export const getSubscriptions = async ({
  userId,
  isActive,
  type,
}: GetSubscriptionsParams): Promise<SubscriptionListItem[]> => {
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
    const plain = s.toJSON() as unknown as SubscriptionBase & { linkedTransactionsCount: number | string | null };
    return {
      ...plain,
      expectedAmount: plain.expectedAmount !== null ? Money.fromCents(plain.expectedAmount).toNumber() : null,
      linkedTransactionsCount: Number(plain.linkedTransactionsCount ?? 0),
    };
  });
};

export const getSubscriptionById = async ({
  id,
  userId,
}: {
  id: string;
  userId: number;
}): Promise<SubscriptionDetail> => {
  const subscription = await findOrThrowNotFound({
    query: Subscriptions.findOne({
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
    }),
    message: 'Subscription not found.',
  });

  // toJSON() is untyped; describe the loaded shape (Money fields still boxed,
  // join-table metadata nested under SubscriptionTransactions) so the rest is typed.
  const raw = subscription.toJSON() as unknown as SubscriptionBase & {
    transactions?: Array<
      TransactionsAttributes & {
        SubscriptionTransactions: Pick<SubscriptionTransactions, 'matchSource' | 'matchedAt' | 'status'>;
      }
    >;
  };

  const transactions: SubscriptionLinkedTransaction[] = (raw.transactions ?? []).map((tx) => ({
    ...tx,
    amount: tx.amount.toNumber(),
    refAmount: tx.refAmount.toNumber(),
    commissionRate: tx.commissionRate.toNumber(),
    refCommissionRate: tx.refCommissionRate.toNumber(),
    cashbackAmount: tx.cashbackAmount.toNumber(),
  }));

  const nextExpectedDate = computeNextExpectedDate({
    startDate: raw.startDate,
    frequency: raw.frequency,
    transactions,
  });

  return {
    ...raw,
    expectedAmount: raw.expectedAmount !== null ? Money.fromCents(raw.expectedAmount).toNumber() : null,
    transactions,
    nextExpectedDate,
  };
};
