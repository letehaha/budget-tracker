import {
  DeleteAccountPayload,
  UnlinkAccountFromBankConnectionPayload,
  deleteAccount as apiDeleteAccount,
  editAccount as apiEditAccount,
  loadAccounts as apiLoadAccounts,
  unlinkAccountFromBankConnection as apiUnlinkAccountFromBankConnection,
} from '@/api';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { ACCOUNT_CATEGORIES, ACCOUNT_STATUSES, ACCOUNT_TYPES, AccountWithRelinkStatus } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { defineStore, storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useUserStore } from './user';

export const useAccountsStore = defineStore('accounts', () => {
  const queryClient = useQueryClient();
  const { isUserExists } = storeToRefs(useUserStore());

  const accountsRecord = ref<Record<string, AccountWithRelinkStatus>>({});

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

  // Vehicle accounts are assets whose balance is owned by the depreciation model
  // and the override flow — the backend rejects any income/expense/transfer
  // targeting them (only `transfer_out_wallet` overrides are allowed). Exclude
  // them from transaction/transfer account pickers so users never select an
  // account that would 422 on submit. Their value is edited from the vehicle page.
  const txTargetableAccountsActiveFirst = computed(() =>
    systemAccountsActiveFirst.value.filter((item) => item.accountCategory !== ACCOUNT_CATEGORIES.vehicle),
  );

  // Loan accounts model liabilities. Money only flows INTO a loan (the user
  // paying it down via `transfer_to_loan`); a loan can never be the source of
  // an expense, income, or outgoing transfer. Hide loans from source/from
  // pickers everywhere — they remain available in transfer-destination pickers
  // via `txTargetableAccountsActiveFirst` so loan payments still work.
  const txTargetableSourceAccountsActiveFirst = computed(() =>
    txTargetableAccountsActiveFirst.value.filter((item) => item.accountCategory !== ACCOUNT_CATEGORIES.loan),
  );

  /**
   * Accounts that need to be re-linked due to schema migration.
   * These are Enable Banking accounts where externalId doesn't match identification_hash.
   */
  const accountsNeedingRelink = computed(() => accounts.value?.filter((item) => item.needsRelink) ?? []);

  const editAccount = async ({ id, ...data }: Parameters<typeof apiEditAccount>[0]) => {
    await apiEditAccount({ id, ...data });
    await refetchAccounts();

    queryClient.invalidateQueries({
      queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    });
  };

  const deleteAccount = async ({ id }: DeleteAccountPayload) => {
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
  };

  const unlinkAccountFromBankConnection = async ({ id }: UnlinkAccountFromBankConnectionPayload) => {
    await apiUnlinkAccountFromBankConnection({ id });
    await refetchAccounts();

    // The account-details transactions list is an infinite query that retains
    // every page the user scrolled (staleTime: Infinity). A plain invalidate
    // makes TanStack refetch *all* of those pages one-by-one (from=0,10,…,N) — a
    // request storm that scales with scroll depth. Reset it instead: drop the
    // cached pages and reload only the first page.
    const [, accountTransactionsSegment] = VUE_QUERY_CACHE_KEYS.accountSpecificTransactions;
    queryClient.resetQueries({ queryKey: VUE_QUERY_CACHE_KEYS.accountSpecificTransactions });

    // Everything else that depends on the now-rewritten transactions / bank
    // connection still needs a normal invalidate (none of these are multi-page
    // infinite caches, so they cost one request each). Skip the account-specific
    // list — it was already reset above.
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey as string[];
        if (queryKey.includes(accountTransactionsSegment)) return false;
        return (
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange) ||
          queryKey.includes(VUE_QUERY_GLOBAL_PREFIXES.bankConnectionChange)
        );
      },
    });
  };

  return {
    accounts,
    accountsRecord,
    activeAccounts,
    systemAccounts,
    activeSystemAccounts,
    systemAccountsActiveFirst,
    txTargetableAccountsActiveFirst,
    txTargetableSourceAccountsActiveFirst,
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
