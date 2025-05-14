<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
    <button v-for="(currency, index) in currenciesList" :key="currency.id" type="button">
      <Card
        :class="[
          'flex flex-col gap-4 rounded-lg border p-4 shadow-sm transition-all duration-300',
          currency.isDefaultCurrency && 'cursor-default',
          !currency.isDefaultCurrency && 'hover:border-green-500',
        ]"
        @click="!currency.isDefaultCurrency && toggleActiveItem(index)"
      >
        <div class="gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <img class="h-5 w-5" :src="getCurrencyIcon(currency.currency.code)" alt="icon" />
              <div class="ml-2 text-lg font-medium text-white">
                {{ currency.currency.currency }}
              </div>
            </div>

            <div>
              <div class="text-sm font-bold">
                {{ currency.quoteRate.toLocaleString() }}

                <span class="text-sm">
                  {{ currency.currency.code }} /
                  {{ baseCurrency.currency.code }}
                </span>
              </div>
              <div class="text-sm font-bold">
                {{ currency.rate.toLocaleString() }}

                <span class="text-sm">
                  {{ baseCurrency.currency.code }} /
                  {{ currency.currency.code }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </button>

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
          @delete="onDeleteHandler(activeItemIndex)"
          @submit="onCurrencyEdit"
        />
      </template>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { deleteUserCurrency, loadUserCurrenciesExchangeRates } from '@/api/currencies';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Card } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';
import { getCurrencyIcon } from '@/js/helpers/currencyImage';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { API_ERROR_CODES, UserCurrencyModel } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, nextTick, ref } from 'vue';

import EditCurrency from './edit-currency.vue';
import { CurrencyWithExchangeRate } from './types';

type ActiveItemIndex = number;

const currenciesStore = useCurrenciesStore();
const accountsStore = useAccountsStore();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { currencies, baseCurrency } = storeToRefs(currenciesStore);
const { accountsCurrencyIds } = storeToRefs(accountsStore);
const queryClient = useQueryClient();

const isEditingModalVisible = ref(false);

const { data: rates } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates,
  queryFn: loadUserCurrenciesExchangeRates,
  staleTime: Infinity,
  placeholderData: [],
});

const currenciesList = computed<CurrencyWithExchangeRate[]>(() =>
  currencies.value.map((item) => {
    const rate = rates.value.find((i) => i.baseCode === item.currency.code);
    const quoteRate = Number(Number(1 / Number(rate?.rate)).toFixed(4));

    return {
      ...item,
      rate: Number(rate?.rate?.toFixed(4)),
      custom: rate?.custom ?? false,
      quoteCode: rate?.quoteCode,
      quoteRate,
    };
  }),
);

const activeItemIndex = ref<ActiveItemIndex>(null);

const selectedCurrency = ref<CurrencyWithExchangeRate | null>(null);

const toggleActiveItem = (index: ActiveItemIndex) => {
  activeItemIndex.value = activeItemIndex.value === index ? null : index;
  selectedCurrency.value = activeItemIndex.value !== null ? currenciesList.value[index] : null;
  isEditingModalVisible.value = !!selectedCurrency.value;
};

const onCurrencyEdit = async () => {
  isEditingModalVisible.value = false;
  await nextTick();
  toggleActiveItem(null);
  queryClient.invalidateQueries({
    queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates,
  });
};

const onDeleteHandler = async (index: ActiveItemIndex) => {
  try {
    await deleteUserCurrency(currencies.value[index].currencyId);
    await currenciesStore.loadCurrencies();
    await onCurrencyEdit();

    addSuccessNotification('Successfully deleted.');
  } catch (e) {
    if (e.data.code === API_ERROR_CODES.unauthorized) return;
    if (e.data.code === API_ERROR_CODES.validationError) {
      addErrorNotification(e.data.message);
      return;
    }
    addErrorNotification('Unexpected error. Currency is not deleted.');
  }
};

const isDeletionDisabled = (currency: UserCurrencyModel) => accountsCurrencyIds.value.includes(currency?.currencyId);
</script>
