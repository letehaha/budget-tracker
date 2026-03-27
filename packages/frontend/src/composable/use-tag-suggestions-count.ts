import { loadTagSuggestionsCount } from '@/api/tag-suggestions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

export function useTagSuggestionsCount() {
  const { data } = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.tagSuggestionsCount,
    queryFn: loadTagSuggestionsCount,
    staleTime: 60_000,
  });

  const count = computed(() => data.value?.count ?? 0);
  const hasPendingSuggestions = computed(() => count.value > 0);

  return { count, hasPendingSuggestions };
}
