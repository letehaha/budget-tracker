import {
  createAccountsGroup,
  deleteAccountGroup,
  linkAccountToGroup,
  loadAccountGroups,
  removeAccountFromGroup,
  updateAccountGroup,
} from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import { useNotificationCenter } from '@/components/notification-center';
import { extractApiErrorMessage, isApiErrorWithCode } from '@/js/errors';
import { API_ERROR_CODES } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { MaybeRefOrGetter, Ref, toValue } from 'vue';
import { useI18n } from 'vue-i18n';

export const useAccountGroupForAccount = (
  accountId: Ref<string>,
  queryOptions: { enabled?: MaybeRefOrGetter<boolean> } = {},
) => {
  const queryClient = useQueryClient();
  const query = useQuery<AccountGroups | null>({
    queryFn: async (): Promise<AccountGroups | null> => {
      const result = await loadAccountGroups({
        accountIds: [accountId.value],
        includeArchived: true,
      });
      return result.length ? result[0]! : null;
    },
    queryKey: [...VUE_QUERY_CACHE_KEYS.accountGroupForAccount, accountId],
    staleTime: Infinity,
    ...queryOptions,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [...VUE_QUERY_CACHE_KEYS.accountGroupForAccount, accountId.value],
    });
  };
  return {
    ...query,
    group: query.data,
    invalidate,
  };
};

/**
 * Shared wiring for every write against `/account-group`: refresh both caches that hold
 * group membership — the flat list and the per-account lookup — then report the outcome.
 * Error copy prefers the server's own message so a validation failure or a write lock held
 * by a restore says what it is, with the operation-specific key as the fallback.
 *
 * Notification keys live in the `common` i18n chunk, not `settings/accounts-groups`: these
 * writes also fire from the link dialog on the accounts and account pages, where the
 * settings chunk was never loaded and a key from it would render as a raw dotted path.
 */
const useAccountGroupMutation = <TVariables = void>({
  mutationFn,
  successKey,
  errorKey,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<unknown>;
  /** Omit for writes whose result is obvious from the UI updating (e.g. creating a group). */
  successKey?: string;
  errorKey: string;
  onSuccess?: () => void;
}) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

  return useMutation<unknown, unknown, TVariables>({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.accountGroups });
      // Prefix key — drops the cached group for every account, not just the one written.
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.accountGroupForAccount });
      if (successKey) addSuccessNotification(t(successKey));
      onSuccess?.();
    },
    onError: (error) => {
      // The API client already logs the user out and announces an expired session on 401,
      // so a second toast here would blame the group operation for it.
      if (isApiErrorWithCode(error, API_ERROR_CODES.unauthorized)) return;
      addErrorNotification(extractApiErrorMessage(error) || t(errorKey));
    },
  });
};

export const useCreateAccountGroup = ({ onSuccess }: { onSuccess?: () => void } = {}) =>
  useAccountGroupMutation({
    mutationFn: ({ name }: { name: string }) => createAccountsGroup({ name }),
    errorKey: 'accountGroups.create.error',
    onSuccess,
  });

export const useRenameAccountGroup = ({ groupId }: { groupId: MaybeRefOrGetter<string> }) =>
  useAccountGroupMutation({
    mutationFn: ({ name }: { name: string }) => updateAccountGroup({ groupId: toValue(groupId), updates: { name } }),
    successKey: 'accountGroups.rename.success',
    errorKey: 'accountGroups.rename.error',
  });

export const useDeleteAccountGroup = ({
  groupId,
  onSuccess,
}: {
  groupId: MaybeRefOrGetter<string>;
  onSuccess?: () => void;
}) =>
  useAccountGroupMutation({
    mutationFn: () => deleteAccountGroup({ groupId: toValue(groupId) }),
    successKey: 'accountGroups.delete.success',
    errorKey: 'accountGroups.delete.error',
    onSuccess,
  });

export const useLinkAccountToGroup = ({ onSuccess }: { onSuccess?: () => void } = {}) =>
  useAccountGroupMutation({
    mutationFn: ({ accountId, groupId }: { accountId: string; groupId: string }) =>
      linkAccountToGroup({ accountId, groupId }),
    successKey: 'accountGroups.link.success',
    errorKey: 'accountGroups.link.error',
    onSuccess,
  });

export const useUnlinkAccountFromGroup = ({ onSuccess }: { onSuccess?: () => void } = {}) =>
  useAccountGroupMutation({
    mutationFn: ({ accountId, groupId }: { accountId: string; groupId: string }) =>
      removeAccountFromGroup({ accountIds: [accountId], groupId }),
    successKey: 'accountGroups.unlink.success',
    errorKey: 'accountGroups.unlink.error',
    onSuccess,
  });
