<script setup lang="ts">
import { ACCOUNT_CATEGORIES_VERBOSE } from '@/common/const';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import { toLocalNumber } from '@/js/helpers';
import { useCurrenciesStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

defineProps<{
  account: AccountModel;
  tabName: string;
}>();

const { currenciesMap } = storeToRefs(useCurrenciesStore());
const isOpen = ref(false);
</script>

<template>
  <Tabs.TabsContent :value="tabName">
    <div class="grid gap-4 py-6">
      <div class="flex items-center justify-between gap-2">
        <span> Credit Limit: </span>

        {{ toLocalNumber(account.creditLimit) }}
        {{ currenciesMap[account.currencyId].currency.code }}
      </div>
      <Separator />

      <div class="flex items-center justify-between gap-2">
        <span> Initial Balance: </span>

        {{ toLocalNumber(account.initialBalance) }}
        {{ currenciesMap[account.currencyId].currency.code }}
      </div>
      <Separator />
      <div class="flex items-center justify-between gap-2">
        <span> Account Type: </span>

        {{ account.type }}
      </div>
      <Separator />

      <div class="flex items-center justify-between gap-2">
        <span> Account Category: </span>

        <span class="capitalize">
          {{ ACCOUNT_CATEGORIES_VERBOSE[account.accountCategory] }}
        </span>
      </div>
      <Separator />

      <Collapsible.Collapsible v-model:open="isOpen">
        <Collapsible.CollapsibleTrigger class="w-full">
          <div class="flex items-center justify-between gap-2">
            <span> Currency: </span>

            <div class="flex gap-2">
              {{ currenciesMap[account.currencyId].currency.code }}

              <span v-if="currenciesMap[account.currencyId].isDefaultCurrency"> (main) </span>

              <template v-if="isOpen">
                <ChevronUpIcon />
              </template>
              <template v-else>
                <ChevronDownIcon />
              </template>
            </div>
          </div>
        </Collapsible.CollapsibleTrigger>

        <Collapsible.CollapsibleContent>
          <div class="grid gap-2 pt-4 pl-4">
            <Separator />

            <div class="flex items-center justify-between gap-2">
              <span> Exchange Rate: </span>

              {{ currenciesMap[account.currencyId].exchangeRate }}
            </div>

            <Separator />

            <div class="flex items-center justify-between gap-2">
              <span> Exchange Rate Live Update: </span>

              {{ currenciesMap[account.currencyId].liveRateUpdate ? 'Enabled' : 'Disabled' }}
            </div>
          </div>
        </Collapsible.CollapsibleContent>
      </Collapsible.Collapsible>
    </div>
  </Tabs.TabsContent>
</template>
