import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import type { QueryClient } from '@tanstack/vue-query';

/**
 * Invalidates all caches affected by transaction group mutations
 * (group list, group detail, records list, and latest records widget).
 */
export function invalidateTransactionGroupQueries({ queryClient }: { queryClient: QueryClient }): void {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.transactionGroupDetail });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.transactionGroupsList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.recordsPageRecordsList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.widgetLatestRecords });
}
