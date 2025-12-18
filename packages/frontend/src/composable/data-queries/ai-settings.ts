import * as aiSettingsApi from '@/api/ai-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

/**
 * Composable for managing AI settings (API keys for different providers)
 */
export function useAiSettings() {
  const queryClient = useQueryClient();

  const { data: aiApiKeyStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.aiSettings,
    queryFn: aiSettingsApi.getAiApiKeyStatus,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const { mutateAsync: setApiKey, isPending: isSettingKey } = useMutation({
    mutationFn: aiSettingsApi.setAiApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiSettings });
    },
  });

  const { mutateAsync: setDefaultProvider, isPending: isSettingDefault } = useMutation({
    mutationFn: aiSettingsApi.setDefaultAiProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiSettings });
    },
  });

  const { mutateAsync: deleteApiKey, isPending: isDeletingKey } = useMutation({
    mutationFn: aiSettingsApi.deleteAiApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiSettings });
    },
  });

  const { mutateAsync: deleteAllApiKeys, isPending: isDeletingAll } = useMutation({
    mutationFn: aiSettingsApi.deleteAllAiApiKeys,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.aiSettings });
    },
  });

  return {
    aiApiKeyStatus,
    isLoadingStatus,
    setApiKey,
    isSettingKey,
    setDefaultProvider,
    isSettingDefault,
    deleteApiKey,
    isDeletingKey,
    deleteAllApiKeys,
    isDeletingAll,
  };
}
