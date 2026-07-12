/**
 * MCP-specific slimming over the REST serializer output.
 *
 * The REST serializers (`serializeAccounts`, `serializeTransactions`) carry
 * fields the frontend needs — ACL/share context, UI hints, audit timestamps,
 * near-always-zero fee fields. For an AI client over MCP those are wasted context
 * tokens. These helpers take the already-serialized, already-decimal output and keep only the
 * fields an assistant reasons about. The shared serializers stay untouched.
 */
import type Accounts from '@models/accounts.model';
import type Categories from '@models/categories.model';
import type SubscriptionTransactions from '@models/subscription-transactions.model';
import type Subscriptions from '@models/subscriptions.model';
import type { TransactionsAttributes } from '@models/transactions.model';
import type { AccountApiResponse } from '@root/serializers/accounts.serializer';
import type { TransactionApiResponse } from '@root/serializers/transactions.serializer';

export function slimAccountsForMcp(accounts: AccountApiResponse[]) {
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    accountCategory: a.accountCategory,
    currencyCode: a.currencyCode,
    currentBalance: a.currentBalance,
    refCurrentBalance: a.refCurrentBalance,
    creditLimit: a.creditLimit,
    refCreditLimit: a.refCreditLimit,
    status: a.status,
    excludeFromStats: a.excludeFromStats,
  }));
}

export function slimTransactionsForMcp(txs: TransactionApiResponse[]) {
  return txs.map((tx) => ({
    id: tx.id,
    time: tx.time,
    amount: tx.amount,
    refAmount: tx.refAmount,
    currencyCode: tx.currencyCode,
    note: tx.note,
    transactionType: tx.transactionType,
    transferNature: tx.transferNature,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    ...(tx.tags && { tags: tx.tags.map((t) => ({ id: t.id, name: t.name })) }),
    ...(tx.splits && {
      splits: tx.splits.map((s) => ({ categoryId: s.categoryId, amount: s.amount, note: s.note })),
    }),
    ...(tx.transactionGroups && { transactionGroups: tx.transactionGroups }),
  }));
}

/**
 * Shape of a `getSubscriptionById` result, narrowed to the fields the MCP slimmer
 * reads. Scalar fields are picked straight from the models so the types track the
 * schema; only the values the service transforms are overridden — `expectedAmount`
 * /`amount`/`refAmount` (Money → decimal number), the trimmed `account`/`category`
 * associations, and the computed `nextExpectedDate`. The service returns a loosely
 * typed `toJSON()` blob, so the tool casts into this before slimming.
 */
export type SubscriptionDetailForMcp = Pick<
  Subscriptions,
  'id' | 'name' | 'type' | 'frequency' | 'startDate' | 'endDate' | 'isActive' | 'notes' | 'expectedCurrencyCode'
> & {
  expectedAmount: number | null;
  nextExpectedDate: Date | string | null;
  account?: Pick<Accounts, 'id' | 'name' | 'currencyCode'> | null;
  category?: Pick<Categories, 'id' | 'name'> | null;
  transactions?: Array<
    Pick<
      TransactionsAttributes,
      'id' | 'time' | 'currencyCode' | 'note' | 'transactionType' | 'categoryId' | 'accountId'
    > & {
      amount: number;
      refAmount: number;
      SubscriptionTransactions?: Pick<SubscriptionTransactions, 'matchSource' | 'matchedAt'> | null;
    }
  > | null;
};

export function slimSubscriptionDetailForMcp(sub: SubscriptionDetailForMcp) {
  return {
    id: sub.id,
    name: sub.name,
    type: sub.type,
    expectedAmount: sub.expectedAmount,
    expectedCurrencyCode: sub.expectedCurrencyCode,
    frequency: sub.frequency,
    startDate: sub.startDate,
    endDate: sub.endDate,
    isActive: sub.isActive,
    notes: sub.notes,
    nextExpectedDate: sub.nextExpectedDate,
    account: sub.account ?? null,
    category: sub.category ? { id: sub.category.id, name: sub.category.name } : null,
    // Embedded transactions arrive as full Transaction models; keep only what
    // confirms the link, plus the junction's match source/date.
    transactions: (sub.transactions ?? []).map((tx) => ({
      id: tx.id,
      time: tx.time,
      amount: tx.amount,
      refAmount: tx.refAmount,
      currencyCode: tx.currencyCode,
      note: tx.note,
      transactionType: tx.transactionType,
      categoryId: tx.categoryId,
      accountId: tx.accountId,
      matchSource: tx.SubscriptionTransactions?.matchSource ?? null,
      matchedAt: tx.SubscriptionTransactions?.matchedAt ?? null,
    })),
  };
}
