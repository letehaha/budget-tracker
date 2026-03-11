import { type UserSettingsSchema, getUserSettings, updateUserSettings } from '@/api/user-settings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

export const useUserSettings = (
  queryOptions: Partial<Parameters<typeof useQuery<UserSettingsSchema, Error>>[0]> = {},
) => {
  const queryArray = ['user-settings'];
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
