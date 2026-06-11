import { type UserSettingsSchema, getUserSettings, patchUserSettings, updateUserSettings } from '@/api/user-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

export const useUserSettings = (
  queryOptions: Partial<Parameters<typeof useQuery<UserSettingsSchema, Error>>[0]> = {},
) => {
  const queryArray = [...VUE_QUERY_CACHE_KEYS.userSettings];
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: getUserSettings,
    queryKey: queryArray,
    staleTime: Infinity,
    ...queryOptions,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryArray });
  };

  const mutation = useMutation({
    mutationFn: updateUserSettings,
    onSuccess: (data) => queryClient.setQueryData(queryArray, () => data),
    onError: invalidate,
  });

  // Partial update: the server merges the patch into its stored value, so
  // callers don't need the settings loaded and concurrent slice updates can't
  // overwrite each other. The response is the full merged settings.
  const patchMutation = useMutation({
    mutationFn: patchUserSettings,
    onSuccess: (data) => queryClient.setQueryData(queryArray, () => data),
    onError: invalidate,
  });

  return {
    invalidate,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    patch: patchMutation.mutate,
    patchAsync: patchMutation.mutateAsync,
    isPatching: patchMutation.isPending,
    ...query,
  };
};
