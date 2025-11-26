<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
    <button v-for="(currency, index) in currenciesList" :key="currency.id" type="button">
      <Card
        :class="[
          'flex cursor-auto flex-col gap-4 rounded-lg border p-4 shadow-xs transition-all duration-300',
          !currency.isDefaultCurrency && 'hover:bg-card-tooltip cursor-pointer',
        ]"
        @click="selectCurrency(currency)"
      >
        <div class="gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <img class="h-5 w-5" :src="getCurrencyIcon(currency.currency.code)" alt="icon" />
              <div class="ml-2 flex items-center gap-2 text-lg font-medium text-white">
                {{ currency.currency.currency }}

                <template v-if="currency.isDefaultCurrency">
                  <ui-tooltip
                    position="top"
                    content="Your base currency. All information on dashboard is displayed in this currency"
                  >
                    <div
                      class="bg-background border-accent flex items-center gap-1 rounded border px-2 py-1 text-xs text-white"
                    >
                      Base currency
                      <InfoIcon class="size-4" />
                    </div>
                  </ui-tooltip>
                </template>
              </div>
            </div>

            <div>
              <div class="text-sm font-bold">
                {{ currency.rate.toLocaleString() }}

                <span class="text-sm">
                  {{ currency.currency.code }} /
                  {{ baseCurrency.currency.code }}
                </span>
              </div>
              <div class="text-sm font-bold">
                {{ currency.quoteRate.toLocaleString() }}

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
import UiTooltip from '@/components/common/tooltip.vue';
import { Card } from '@/components/lib/ui/card';
import { getCurrencyIcon } from '@/js/helpers/currencyImage';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { UserCurrencyModel } from '@bt/shared/types';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { InfoIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, nextTick, ref } from 'vue';

import EditCurrency from './edit-currency/index.vue';
import { CurrencyWithExchangeRate } from './types';

const currenciesStore = useCurrenciesStore();
const accountsStore = useAccountsStore();
const { currencies, baseCurrency } = storeToRefs(currenciesStore);
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
