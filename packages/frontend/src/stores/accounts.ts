import {
  DeleteAccountPayload,
  createAccount as apiCreateAccount,
  deleteAccount as apiDeleteAccount,
  editAccount as apiEditAccount,
  loadAccounts as apiLoadAccounts,
} from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
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

  const accountsCurrencyIds = computed(() => [...new Set(accounts.value.map((item) => item.currencyId))]);

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
      if (data.isEnabled !== undefined) {
        queryClient.invalidateQueries({
          queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
        });
      }
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
    }
  };

  return {
    accounts,
    accountsRecord,
    enabledAccounts,
    systemAccounts,
    accountsCurrencyIds,

    refetchAccounts,

    createAccount,
    editAccount,
    deleteAccount,
  };
});
