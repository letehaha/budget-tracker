import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import type { QueryClient } from '@tanstack/vue-query';

import { invalidateTransferRelatedQueries } from './portfolio-transfers';

/**
 * Invalidate every query whose result depends on a portfolio's holdings,
 * transactions, balances, or aggregate stats. Call after any mutation that
 * changes a holding (create / delete) or its investment transactions —
 * cost basis, market value, cash balances, transfers, and the dashboard
 * widgets that roll them up are all derived state and must refetch.
 *
 * Implementation: every holdings/portfolio cache key is co-prefixed with
 * `securityPriceChange`, so a single prefix invalidation covers all of
 * them plus the widget/analytics queries that share the prefix. Mutating
 * a holding also shifts portfolio cash, which flows through the same
 * caches as portfolio transfers (account widgets, analytics, records).
 *
 * TanStack only refetches *active* queries, so the broad scope doesn't
 * trigger refetches for portfolios the user isn't currently viewing.
 */
export const invalidatePortfolioState = ({ queryClient }: { queryClient: QueryClient }) => {
  queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.securityPriceChange] });
  invalidateTransferRelatedQueries(queryClient);
};
