import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { QueryClient } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';

import { invalidateTransferRelatedQueries } from './portfolio-transfers';

describe('invalidateTransferRelatedQueries', () => {
  it('invalidates account-specific transactions so new portfolio transfers appear in the account page list', () => {
    const queryClient = new QueryClient();
    const accountKey = [...VUE_QUERY_CACHE_KEYS.accountSpecificTransactions, 67];

    queryClient.setQueryData(accountKey, ['stale-data']);
    expect(queryClient.getQueryState(accountKey)?.isInvalidated).toBe(false);

    invalidateTransferRelatedQueries(queryClient);

    expect(queryClient.getQueryState(accountKey)?.isInvalidated).toBe(true);
  });

  it('invalidates all transactionChange-tracked queries (widgets, analytics, records)', () => {
    const queryClient = new QueryClient();
    const keys = [
      VUE_QUERY_CACHE_KEYS.widgetLatestRecords,
      VUE_QUERY_CACHE_KEYS.analyticsCashFlow,
      VUE_QUERY_CACHE_KEYS.recordsPageTransactionList,
      [VUE_QUERY_GLOBAL_PREFIXES.transactionChange, 'custom-consumer'],
    ];

    keys.forEach((k) => queryClient.setQueryData(k, ['stale']));

    invalidateTransferRelatedQueries(queryClient);

    keys.forEach((k) => {
      expect(queryClient.getQueryState(k)?.isInvalidated).toBe(true);
    });
  });
});
