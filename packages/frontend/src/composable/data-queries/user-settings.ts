import { type UserSettingsSchema, getUserSettings, updateUserSettings } from '@/api/user-settings';
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

  return {
    invalidate,
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    ...query,
  };
};
