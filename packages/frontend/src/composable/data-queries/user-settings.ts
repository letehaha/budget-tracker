import {
  type TransactionsTableSettings,
  type UserSettingsSchema,
  getUserSettings,
  updateUserSettings,
} from '@/api/user-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

/**
 * Returns a copy of `settings` with `ui.transactionsTable` patched. The empty
 * column stubs satisfy the schema's required fields when nothing is stored yet;
 * stored values spread after them so an existing config always wins, and the
 * patch spreads last so the caller's change always lands.
 */
export const patchTransactionsTableSettings = ({
  settings,
  patch,
}: {
  settings: UserSettingsSchema;
  patch: Partial<TransactionsTableSettings>;
}): UserSettingsSchema => ({
  ...settings,
  ui: {
    ...settings.ui,
    transactionsTable: {
      visibleColumns: [],
      columnOrder: [],
      ...settings.ui?.transactionsTable,
      ...patch,
    },
  },
});

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
    isUpdating: mutation.isPending,
    ...query,
  };
};
