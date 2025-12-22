<template>
  <Card
    :class="[
      'currency-card relative flex cursor-auto flex-col justify-end gap-4 rounded-lg border p-4 shadow-xs transition-colors duration-300',
      !currency.isDefaultCurrency && 'hover:bg-card-tooltip cursor-pointer',
    ]"
    as="button"
    type="button"
  >
    <div class="gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div
          :class="
            cn(
              'flex min-w-0 flex-wrap items-center gap-2',
              currency.isDefaultCurrency && '@[0px]/card:mt-3 @[370px]/card:mt-0',
            )
          "
        >
          <img class="h-5 w-5 shrink-0" :src="getCurrencyIcon(currency.currency.code)" alt="icon" />
          <span class="text-lg font-medium text-white">
            {{ currency.currency.currency }}
          </span>

          <ResponsiveTooltip
            v-if="currency.isDefaultCurrency"
            content="Your base currency. All information on dashboard is displayed in this currency"
            class="@[0px]/card:absolute @[0px]/card:top-0 @[0px]/card:left-0 @[370px]/card:static"
            contentClassName="max-w-[320px]"
          >
            <div
              class="bg-background border-accent flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs whitespace-nowrap text-white"
            >
              Base currency
              <InfoIcon class="size-4" />
            </div>
          </ResponsiveTooltip>
        </div>

        <div class="shrink-0 text-right">
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
</template>

<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { Card } from '@/components/lib/ui/card';
import { getCurrencyIcon } from '@/js/helpers/currencyImage';
import { cn } from '@/lib/utils';
import { useCurrenciesStore } from '@/stores';
import { InfoIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';

import type { CurrencyWithExchangeRate } from './types';

defineProps<{ currency: CurrencyWithExchangeRate }>();

const currenciesStore = useCurrenciesStore();
const { baseCurrency } = storeToRefs(currenciesStore);
</script>

<style scoped>
.currency-card {
  container-name: card;
  container-type: inline-size;
}
</style>
