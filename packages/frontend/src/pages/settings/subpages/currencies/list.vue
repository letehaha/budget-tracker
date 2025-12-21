<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
    <template v-for="currency in currenciesList" :key="currency.id">
      <ListItem :currency="currency" @click="selectCurrency(currency)" />
    </template>

    <ResponsiveDialog v-model:open="isEditingModalVisible">
      <template #trigger>
        <slot />
      </template>

      <template #title>
        <span> Edit currency </span>
      </template>

      <template v-if="selectedCurrency">
        <edit-currency
          :currency="selectedCurrency"
          :deletion-disabled="isDeletionDisabled(selectedCurrency)"
          @submit="onCurrencyEdit"
        />
      </template>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { loadUserCurrenciesExchangeRates } from '@/api/currencies';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { UserCurrencyModel } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, nextTick, ref } from 'vue';

import EditCurrency from './edit-currency/index.vue';
import ListItem from './list-item.vue';
import { CurrencyWithExchangeRate } from './types';

const currenciesStore = useCurrenciesStore();
const accountsStore = useAccountsStore();
const { currencies } = storeToRefs(currenciesStore);
const { accountsCurrencyCodes } = storeToRefs(accountsStore);
const queryClient = useQueryClient();

const isEditingModalVisible = ref(false);

const { data: rates } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates,
  queryFn: loadUserCurrenciesExchangeRates,
  staleTime: Infinity,
  placeholderData: [],
});

const currenciesList = computed<CurrencyWithExchangeRate[]>(() =>
  currencies.value
    .map((item) => {
      const rate = rates.value.find((i) => i.baseCode === item.currency.code);
      const quoteRate = Number(Number(1 / Number(rate?.rate)).toFixed(4));

      return {
        ...item,
        rate: Number(rate?.rate?.toFixed(4)),
        custom: rate?.custom ?? false,
        quoteCode: rate?.quoteCode,
        quoteRate,
      };
    })
    .sort((a) => (a.isDefaultCurrency ? -1 : 1)),
);

const selectedCurrency = ref<CurrencyWithExchangeRate | null>(null);

const onCurrencyEdit = async () => {
  currenciesStore.loadCurrencies();
  isEditingModalVisible.value = false;

  await nextTick();

  queryClient.invalidateQueries({
    queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates,
  });
};

const selectCurrency = (currency: CurrencyWithExchangeRate) => {
  if (currency.isDefaultCurrency) return;

  selectedCurrency.value = currency;

  isEditingModalVisible.value = true;
};

const isDeletionDisabled = (currency: UserCurrencyModel) =>
  accountsCurrencyCodes.value.includes(currency?.currencyCode);
</script>
