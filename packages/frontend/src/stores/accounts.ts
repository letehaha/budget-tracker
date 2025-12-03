import {
  DeleteAccountPayload,
  UnlinkAccountFromBankConnectionPayload,
  createAccount as apiCreateAccount,
  deleteAccount as apiDeleteAccount,
  editAccount as apiEditAccount,
  loadAccounts as apiLoadAccounts,
  unlinkAccountFromBankConnection as apiUnlinkAccountFromBankConnection,
} from '@/api';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { ACCOUNT_TYPES, AccountModel } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { defineStore, storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useUserStore } from './user';

export const useAccountsStore = defineStore('accounts', () => {
  const queryClient = useQueryClient();
  const { isUserExists } = storeToRefs(useUserStore());

  const accountsRecord = ref<Record<number, AccountModel>>({});

  const { data: accounts, refetch: refetchAccounts } = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
    queryFn: apiLoadAccounts,
    staleTime: Infinity,
    placeholderData: [],
    enabled: isUserExists,
  });

  watch(accounts, (value) => {
    for (const acc of value) {
      accountsRecord.value[acc.id] = acc;
    }
  });

  const accountsCurrencyCodes = computed(() => [...new Set(accounts.value.map((item) => item.currencyCode))]);

  const systemAccounts = computed(() => accounts.value.filter((item) => item.type === ACCOUNT_TYPES.system));
  const enabledAccounts = computed(() => accounts.value.filter((item) => item.isEnabled));

  const createAccount = async (payload: Parameters<typeof apiCreateAccount>[0]) => {
    try {
      await apiCreateAccount(payload);
      await refetchAccounts();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
    }
  };

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
    enabledAccounts,
    systemAccounts,
    accountsCurrencyCodes,

    loadAccounts: refetchAccounts,
    refetchAccounts,

    createAccount,
    editAccount,
    deleteAccount,
    unlinkAccountFromBankConnection,
  };
});
