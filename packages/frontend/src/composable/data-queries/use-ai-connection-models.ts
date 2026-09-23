import { listAiConnectionModels } from '@/api/ai-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { AI_PROVIDER, ListAIConnectionModelsBody } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

const TYPING_DEBOUNCE_MS = 500;

const canListModels = ({ provider, baseUrl, apiKey, connectionId }: ListAIConnectionModelsBody) =>
  provider === AI_PROVIDER.custom ? Boolean(baseUrl && URL.canParse(baseUrl)) : Boolean(apiKey || connectionId);

/**
 * Live model ids the provider serves, listed by the backend (browsers can't call providers).
 * Suggestions are optional, so a failure yields an empty list without retries or toasts.
 */
export const useAiConnectionModels = ({
  params,
  enabled,
}: {
  params: MaybeRefOrGetter<ListAIConnectionModelsBody>;
  enabled: MaybeRefOrGetter<boolean>;
}) => {
  // Null while disabled moves the key off the entry holding the typed API key, so gcTime 0 evicts it.
  const debouncedParams = refDebounced(
    computed(() => (toValue(enabled) ? toValue(params) : null)),
    TYPING_DEBOUNCE_MS,
  );

  const modelsQuery = useQuery({
    queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.aiConnectionModels, debouncedParams.value]),
    queryFn: () => listAiConnectionModels(debouncedParams.value!),
    enabled: computed(() => debouncedParams.value !== null && canListModels(debouncedParams.value)),
    retry: false,
    gcTime: 0,
  });

  return {
    liveModels: computed(() => (modelsQuery.isError.value ? [] : (modelsQuery.data.value?.models ?? []))),
    isLoadingLiveModels: modelsQuery.isFetching,
  };
};
