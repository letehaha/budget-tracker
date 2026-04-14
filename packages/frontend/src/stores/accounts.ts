import {
  DeleteAccountPayload,
  UnlinkAccountFromBankConnectionPayload,
  deleteAccount as apiDeleteAccount,
  editAccount as apiEditAccount,
  loadAccounts as apiLoadAccounts,
  unlinkAccountFromBankConnection as apiUnlinkAccountFromBankConnection,
} from '@/api';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { ACCOUNT_STATUSES, ACCOUNT_TYPES, AccountWithRelinkStatus } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { defineStore, storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useUserStore } from './user';

export const useAccountsStore = defineStore('accounts', () => {
  const queryClient = useQueryClient();
  const { isUserExists } = storeToRefs(useUserStore());

  const accountsRecord = ref<Record<number, AccountWithRelinkStatus>>({});

  const {
    data: accounts,
    refetch: refetchAccounts,
    isFetched: isAccountsFetched,
  } = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
    queryFn: apiLoadAccounts,
    staleTime: Infinity,
    placeholderData: [],
    enabled: isUserExists,
  });

  watch(accounts, (value) => {
    for (const acc of value ?? []) {
      accountsRecord.value[acc.id] = acc;
    }
  });

  const accountsCurrencyCodes = computed(() => [...new Set(accounts.value?.map((item) => item.currencyCode) ?? [])]);

  const systemAccounts = computed(() => accounts.value?.filter((item) => item.type === ACCOUNT_TYPES.system) ?? []);
  const activeAccounts = computed(
    () => accounts.value?.filter((item) => item.status === ACCOUNT_STATUSES.active) ?? [],
  );
  const activeSystemAccounts = computed(() =>
    systemAccounts.value.filter((item) => item.status === ACCOUNT_STATUSES.active),
  );
  // Active accounts first, archived appended at the end — so selectors can render
  // archived as de-emphasized entries without losing access to them.
  const systemAccountsActiveFirst = computed(() => [
    ...activeSystemAccounts.value,
    ...systemAccounts.value.filter((item) => item.status === ACCOUNT_STATUSES.archived),
  ]);

  /**
   * Accounts that need to be re-linked due to schema migration.
   * These are Enable Banking accounts where externalId doesn't match identification_hash.
   */
  const accountsNeedingRelink = computed(() => accounts.value?.filter((item) => item.needsRelink) ?? []);

  const editAccount = async ({ id, ...data }: Parameters<typeof apiEditAccount>[0]) => {
    try {
      await apiEditAccount({ id, ...data });
      await refetchAccounts();

      queryClient.invalidateQueries({
        queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
      throw e;
    }
  };

  const deleteAccount = async ({ id }: DeleteAccountPayload) => {
    try {
      await apiDeleteAccount({ id });
      await refetchAccounts();
      // Invalidate all queries that depend on transaction changes
      // since deleting an account will delete all associated transactions
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey as string[];
          return queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange);
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
    }
  };

  const unlinkAccountFromBankConnection = async ({ id }: UnlinkAccountFromBankConnectionPayload) => {
    try {
      await apiUnlinkAccountFromBankConnection({ id });
      await refetchAccounts();
      // Invalidate all queries that depend on transaction changes
      // since unlinking updates all associated transactions
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey as string[];
          return (
            queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange) ||
            queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange)
          );
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
      throw e;
    }
  };

  return {
    accounts,
    accountsRecord,
    activeAccounts,
    systemAccounts,
    activeSystemAccounts,
    systemAccountsActiveFirst,
    accountsCurrencyCodes,
    accountsNeedingRelink,
    isAccountsFetched,

    loadAccounts: refetchAccounts,
    refetchAccounts,

    editAccount,
    deleteAccount,
    unlinkAccountFromBankConnection,
  };
});
