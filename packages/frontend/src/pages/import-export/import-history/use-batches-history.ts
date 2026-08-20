import { getBatchesHistory } from '@/api/import-export';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useOffsetHistoryQuery } from '@/composable/use-offset-history-query';

/** Past import batches, newest first. */
export function useBatchesHistory() {
  const { items: batches, ...rest } = useOffsetHistoryQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.importBatchesHistory,
    fetchPage: getBatchesHistory,
  });

  return { batches, ...rest };
}
