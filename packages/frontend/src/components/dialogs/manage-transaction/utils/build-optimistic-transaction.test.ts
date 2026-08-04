import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import type { TransactionModel } from '@bt/shared/types';
import { QueryClient } from '@tanstack/vue-query';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyOptimisticTransactionUpdate } from './build-optimistic-transaction';

const buildTransaction = (overrides: Record<string, unknown> = {}): TransactionModel =>
  ({
    id: 'tx-1',
    amount: 100,
    transactionType: 'expense',
    note: 'original',
    ...overrides,
  }) as unknown as TransactionModel;

describe('applyOptimisticTransactionUpdate', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('updates infinite queries whose pages are transaction arrays', () => {
    const queryKey = [...VUE_QUERY_CACHE_KEYS.recordsPageTransactionList];
    queryClient.setQueryData(queryKey, {
      pages: [[buildTransaction(), buildTransaction({ id: 'tx-2' })]],
      pageParams: [0],
    });

    applyOptimisticTransactionUpdate({
      queryClient,
      transactionId: 'tx-1',
      updatedTransaction: buildTransaction({ note: 'updated' }),
    });

    const data = queryClient.getQueryData<{ pages: TransactionModel[][] }>(queryKey);
    expect(data!.pages[0]![0]!.note).toBe('updated');
    expect(data!.pages[0]![1]!.note).toBe('original');
  });

  it('leaves infinite queries whose pages are objects untouched', () => {
    const queryKey = [...VUE_QUERY_CACHE_KEYS.aiCategorizationHistory];
    const page = { items: [{ categorizedAt: '2026-08-03T00:00:00.000Z', transactionsCount: 5 }], totalCount: 1 };
    queryClient.setQueryData(queryKey, { pages: [page], pageParams: [0] });

    expect(() =>
      applyOptimisticTransactionUpdate({
        queryClient,
        transactionId: 'tx-1',
        updatedTransaction: buildTransaction({ note: 'updated' }),
      }),
    ).not.toThrow();

    expect(queryClient.getQueryData(queryKey)).toEqual({ pages: [page], pageParams: [0] });
  });

  it('updates transactions nested in `items` pages', () => {
    const queryKey = [...VUE_QUERY_CACHE_KEYS.aiCategorizationCandidates];
    queryClient.setQueryData(queryKey, {
      pages: [{ items: [buildTransaction(), buildTransaction({ id: 'tx-2' })], totalCount: 2 }],
      pageParams: [0],
    });

    applyOptimisticTransactionUpdate({
      queryClient,
      transactionId: 'tx-1',
      updatedTransaction: buildTransaction({ note: 'updated' }),
    });

    const data = queryClient.getQueryData<{ pages: { items: TransactionModel[]; totalCount: number }[] }>(queryKey);
    expect(data!.pages[0]!.items[0]!.note).toBe('updated');
    expect(data!.pages[0]!.items[1]!.note).toBe('original');
    expect(data!.pages[0]!.totalCount).toBe(2);
  });

  it('ignores non-transaction caches sharing the transactionChange prefix', () => {
    const queryKey = [VUE_QUERY_GLOBAL_PREFIXES.transactionChange, 'some-widget'];
    queryClient.setQueryData(queryKey, { total: 42 });

    expect(() =>
      applyOptimisticTransactionUpdate({
        queryClient,
        transactionId: 'tx-1',
        updatedTransaction: buildTransaction({ note: 'updated' }),
      }),
    ).not.toThrow();

    expect(queryClient.getQueryData(queryKey)).toEqual({ total: 42 });
  });
});
