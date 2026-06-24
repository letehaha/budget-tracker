import {
  SUBSCRIPTION_LINK_STATUS,
  SUBSCRIPTION_PERIOD_STATUSES,
  type SubscriptionPeriodStatus,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import SubscriptionPeriods from '@models/subscription-periods.model';
import SubscriptionTransactions from '@models/subscription-transactions.model';
import Subscriptions from '@models/subscriptions.model';
import Transactions, { type TransactionsAttributes } from '@models/transactions.model';
import { applyCachedLogos, enqueueLogoResolution } from '@services/brand-logos';
import { fn, literal, Op } from 'sequelize';

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
 * decimal number – the type stays `number | null`, only the value changes.
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
  | 'remindBefore'
  | 'notifyEmail'
  | 'logoDomain'
  | 'logoSource'
  | 'createdAt'
  | 'updatedAt'
> {
  account: SubscriptionAccount | null;
  category: SubscriptionCategory | null;
}

/**
 * Lazy-on-read logo backfill for subscriptions with `logoSource IS NULL`.
 * Stamps `BrandLogos` cache hits onto the model instances (not their toJSON
 * projections) so hits are reflected when the caller serializes them on THIS
 * request; cache misses are enqueued for async logo.dev resolution.
 */
async function backfillLogosForUnresolved({ subscriptions }: { subscriptions: Subscriptions[] }): Promise<void> {
  const misses = await applyCachedLogos({ entity: 'subscription', rows: subscriptions });
  for (const subscription of misses) {
    void enqueueLogoResolution({ entity: 'subscription', id: subscription.id });
  }
}

/** Minimal period shape exposed on the list – enough for a "Due in N days" chip. */
interface CurrentPeriod {
  id: string;
  dueDate: string;
  status: SubscriptionPeriodStatus;
}

interface SubscriptionListItem extends SubscriptionBase {
  linkedTransactionsCount: number;
  /** Earliest open (upcoming or overdue) period, or null for detection-only subs. */
  currentPeriod: CurrentPeriod | null;
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

interface SubscriptionPeriodItem {
  id: string;
  subscriptionId: string;
  dueDate: string;
  status: string;
  paidAt: Date | null;
  transactionId: string | null;
  transactionAutoCreated: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SubscriptionDetail extends SubscriptionBase {
  transactions: SubscriptionLinkedTransaction[];
  nextExpectedDate: string | null;
  periods: SubscriptionPeriodItem[];
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

  await backfillLogosForUnresolved({ subscriptions });

  const mapped = subscriptions.map((s) => {
    const plain = s.toJSON() as unknown as SubscriptionBase & { linkedTransactionsCount: number | string | null };
    return {
      ...plain,
      expectedAmount: plain.expectedAmount !== null ? Money.fromCents(plain.expectedAmount).toNumber() : null,
      linkedTransactionsCount: Number(plain.linkedTransactionsCount ?? 0),
    };
  });

  if (mapped.length === 0) {
    return mapped.map((item) => ({ ...item, currentPeriod: null }));
  }

  // Single query for all open periods across the result set.
  // Ordered ASC so the first row per subscriptionId is always the earliest due date.
  const subscriptionIds = mapped.map((item) => item.id);
  const openPeriods = await SubscriptionPeriods.findAll({
    where: {
      subscriptionId: { [Op.in]: subscriptionIds },
      status: { [Op.in]: [SUBSCRIPTION_PERIOD_STATUSES.upcoming, SUBSCRIPTION_PERIOD_STATUSES.overdue] },
    },
    attributes: ['id', 'subscriptionId', 'dueDate', 'status'],
    order: [['dueDate', 'ASC']],
  });

  // Keep only the earliest open period per subscription (first occurrence wins because of ASC order).
  const earliestBySubscriptionId = new Map<string, CurrentPeriod>();
  for (const period of openPeriods) {
    const { subscriptionId, id, dueDate, status } = period;
    if (!earliestBySubscriptionId.has(subscriptionId)) {
      earliestBySubscriptionId.set(subscriptionId, { id, dueDate, status });
    }
  }

  return mapped.map((item) => ({
    ...item,
    currentPeriod: earliestBySubscriptionId.get(item.id) ?? null,
  }));
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
        {
          model: SubscriptionPeriods,
          as: 'periods',
        },
      ],
      order: [[{ model: SubscriptionPeriods, as: 'periods' }, 'dueDate', 'ASC']],
    }),
    message: 'Subscription not found.',
  });

  await backfillLogosForUnresolved({ subscriptions: [subscription] });

  // toJSON() is untyped; describe the loaded shape (Money fields still boxed,
  // join-table metadata nested under SubscriptionTransactions) so the rest is typed.
  const raw = subscription.toJSON() as unknown as SubscriptionBase & {
    transactions?: Array<
      TransactionsAttributes & {
        SubscriptionTransactions: Pick<SubscriptionTransactions, 'matchSource' | 'matchedAt' | 'status'>;
      }
    >;
    periods?: SubscriptionPeriodItem[];
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
    periods: raw.periods ?? [],
  };
};
