import {
  getAccounts,
  refreshBalance,
  removeConnection,
  storeApiKey,
  syncAccounts,
  syncTransactions,
} from '@/api/lunchflow';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { NetworkError, UnexpectedError } from '@/js/errors';
import { API_ERROR_CODES } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useBanksLunchflowStore = defineStore('banks-lunchflow', () => {
  const queryClient = useQueryClient();
  const userSettings = useUserSettings();
  const isConnected = ref(!!userSettings.data.value?.lunchflow.apiToken);
  const isLoading = ref(false);

  watch(
    () => userSettings.data.value?.lunchflow.apiToken,
    (value) => {
      isConnected.value = !!value;
    },
  );

  /**
   * Check if user has Lunch Flow API key stored
   */
  const checkConnection = async () => {
    try {
      const result = await getAccounts();
      console.log('result', result);
      isConnected.value = true;

      return true;
    } catch (e) {
      if (e instanceof NetworkError && e?.data?.code === API_ERROR_CODES.notFound) {
        isConnected.value = false;
        return false;
      }
      throw e;
    }
  };

  /**
   * Store and validate Lunch Flow API key
   */
  const connectAccount = async ({ apiKey }: { apiKey: string }) => {
    try {
      isLoading.value = true;
      await storeApiKey({ apiKey });
      isConnected.value = true;

      // Invalidate accounts cache to refresh
      queryClient.invalidateQueries({
        queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
      });
    } catch (e) {
      if (e instanceof NetworkError && e?.data?.code === API_ERROR_CODES.BadRequest) {
        throw new Error('Invalid API key or Lunch Flow API error');
      }
      throw new UnexpectedError();
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Sync accounts from Lunch Flow to database
   */
  const syncAccountsFromLunchflow = async () => {
    if (!isConnected.value) {
      throw new Error('Lunch Flow not connected');
    }

    try {
      isLoading.value = true;
      const response = await syncAccounts();

      // Invalidate accounts cache to show new accounts
      queryClient.invalidateQueries({
        queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
      });

      return response;
    } catch {
      throw new UnexpectedError();
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Sync transactions for a specific account
   */
  const syncTransactionsForAccount = async (accountId: number) => {
    if (!isConnected.value) {
      throw new Error('Lunch Flow not connected');
    }

    try {
      isLoading.value = true;
      const response = await syncTransactions(accountId);

      // Invalidate transactions cache
      queryClient.invalidateQueries({
        queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange],
      });

      return response;
    } catch {
      throw new UnexpectedError();
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Refresh balance for a specific account
   */
  const refreshAccountBalance = async (accountId: number) => {
    if (!isConnected.value) {
      throw new Error('Lunch Flow not connected');
    }

    try {
      isLoading.value = true;
      const response = await refreshBalance(accountId);

      // Invalidate accounts cache to show updated balance
      queryClient.invalidateQueries({
        queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
      });

      return response;
    } catch {
      throw new UnexpectedError();
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Disconnect Lunch Flow (remove API key)
   */
  const disconnect = async () => {
    try {
      isLoading.value = true;
      await removeConnection();
      isConnected.value = false;

      // Invalidate accounts cache
      queryClient.invalidateQueries({
        queryKey: VUE_QUERY_CACHE_KEYS.allAccounts,
      });
    } catch {
      throw new UnexpectedError();
    } finally {
      isLoading.value = false;
    }
  };

  return {
    isConnected,
    isLoading,

    checkConnection,
    connectAccount,
    syncAccountsFromLunchflow,
    syncTransactionsForAccount,
    refreshAccountBalance,
    disconnect,
  };
});
