/**
 * MCP-specific slimming over the REST serializer output.
 *
 * The REST serializers (`serializeAccounts`, `serializeTransactions`) carry
 * fields the frontend needs — bank-sync metadata, ACL/share context, UI hints,
 * audit timestamps, near-always-zero fee fields. For an AI client over MCP those
 * are wasted context tokens (and `externalData` can be kilobytes per row). These
 * helpers take the already-serialized, already-decimal output and keep only the
 * fields an assistant reasons about. The shared serializers stay untouched.
 */
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
