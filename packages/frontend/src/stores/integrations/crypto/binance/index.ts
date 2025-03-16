import { api } from '@/api/_api';
import { AccountSettings, NormalizedAccountData, RawAccountDataResponse } from '@/common/types';
import { defineStore } from 'pinia';
import { Ref, computed, ref } from 'vue';

import { normalizeAccountData } from './response-normalizer';

export const useCryptoBinanceStore = defineStore('crypto-binance', () => {
  const accountData: Ref<NormalizedAccountData | null> = ref(null);
  const userSettings: Ref<AccountSettings | null> = ref(null);

  const accountBalances = computed(() => accountData.value?.balances);
  const existingBalances = computed(() =>
    accountBalances.value?.filter((item) => Number(item.free) || Number(item.locked)),
  );
  const totalUSDBalance = computed(() =>
    (existingBalances.value || []).reduce((acc, item) => {
      const price = item.price ?? 1;

      return acc + Number(item.total) * Number(price ?? 0);
    }, 0),
  );

  const loadAccountData = async () => {
    try {
      const result: RawAccountDataResponse = await api.get('/crypto/binance/account');

      accountData.value = normalizeAccountData(result);
    } catch (e) {
      throw e;
    }
  };

  const setSettings = async ({ publicKey, secretKey }: { publicKey: string; secretKey: string }) => {
    try {
      const result: AccountSettings = await api.post('/crypto/binance/set-settings', {
        apiKey: publicKey,
        secretKey,
      });

      userSettings.value = result;
    } catch (e) {
      throw e;
    }
  };

  return {
    accountData,
    userSettings,

    accountBalances,
    existingBalances,
    totalUSDBalance,

    loadAccountData,
    setSettings,
  };
});
