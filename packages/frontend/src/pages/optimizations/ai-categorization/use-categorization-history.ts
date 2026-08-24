import { getAiCategorizationHistory } from '@/api/ai-categorization';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useOffsetHistoryQuery } from '@/composable/use-offset-history-query';

/** Past AI categorization runs, newest first. */
export function useCategorizationHistory() {
  const { items: runs, ...rest } = useOffsetHistoryQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.aiCategorizationHistory,
    fetchPage: getAiCategorizationHistory,
  });

  return { runs, ...rest };
}
