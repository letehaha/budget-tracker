import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import type { QueryClient } from '@tanstack/vue-query';

/**
 * Invalidate every query whose result depends on a portfolio's holdings,
 * transactions, balances, or aggregate stats. Call after any mutation that
 * changes a holding (create / delete) or its investment transactions —
 * cost basis, market value, cash balances, transfers, and the dashboard
 * widgets that roll them up are all derived state and must refetch.
 *
 * Pass `portfolioId` to scope the holdings/details/balances/summary keys
 * to a single portfolio (cheaper); omit it to invalidate across all
 * portfolios — needed when the caller (e.g. delete-transaction mutation)
 * does not know which portfolio the change belongs to.
 */
export const invalidatePortfolioState = ({
  queryClient,
  portfolioId,
}: {
  queryClient: QueryClient;
  portfolioId?: string;
}) => {
  const scopedOrAll = <T extends readonly unknown[]>(base: T) =>
    portfolioId ? ([...base, portfolioId] as const) : base;

  queryClient.invalidateQueries({ queryKey: scopedOrAll(VUE_QUERY_CACHE_KEYS.holdingsList) });
  queryClient.invalidateQueries({ queryKey: scopedOrAll(VUE_QUERY_CACHE_KEYS.portfolioDetails) });
  queryClient.invalidateQueries({ queryKey: scopedOrAll(VUE_QUERY_CACHE_KEYS.portfolioSummary) });
  queryClient.invalidateQueries({ queryKey: scopedOrAll(VUE_QUERY_CACHE_KEYS.portfolioBalances) });
  queryClient.invalidateQueries({ queryKey: scopedOrAll(VUE_QUERY_CACHE_KEYS.portfolioTransfers) });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.holdingTransactions });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioInvestmentTransactions });
};
