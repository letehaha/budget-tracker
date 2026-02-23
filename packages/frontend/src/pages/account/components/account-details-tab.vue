<script setup lang="ts">
import { ACCOUNT_CATEGORIES_TRANSLATION_KEYS } from '@/common/const';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import { toLocalNumber } from '@/js/helpers';
import { useCurrenciesStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  account: AccountModel;
  tabName: string;
}>();

const { currenciesMap } = storeToRefs(useCurrenciesStore());
const isOpen = ref(false);
</script>

<template>
  <Tabs.TabsContent :value="tabName">
    <div class="grid gap-4 py-6 text-sm">
      <div class="flex items-center justify-between gap-2">
        <span>{{ t('pages.account.details.creditLimit') }}</span>

        {{ toLocalNumber(account.creditLimit) }}
        {{ currenciesMap[account.currencyCode].currency.code }}
      </div>
      <Separator />

      <div class="flex items-center justify-between gap-2">
        <span>{{ t('pages.account.details.initialBalance') }}</span>

        {{ toLocalNumber(account.initialBalance) }}
        {{ currenciesMap[account.currencyCode].currency.code }}
      </div>
      <Separator />
      <div class="flex items-center justify-between gap-2">
        <span>{{ t('pages.account.details.accountCategory') }}</span>

        <span class="capitalize">
          {{ t(ACCOUNT_CATEGORIES_TRANSLATION_KEYS[account.accountCategory]) }}
        </span>
      </div>
      <Separator />

      <Collapsible.Collapsible v-model:open="isOpen">
        <Collapsible.CollapsibleTrigger class="w-full">
          <div class="flex items-center justify-between gap-2">
            <span>{{ t('pages.account.details.currency') }}</span>

            <div class="flex gap-2">
              {{ currenciesMap[account.currencyCode].currency.code }}

              <span v-if="currenciesMap[account.currencyCode].isDefaultCurrency">
                {{ t('pages.account.details.main') }}
              </span>

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
              <span>{{ t('pages.account.details.exchangeRate') }}</span>

              {{ currenciesMap[account.currencyCode].exchangeRate }}
            </div>

            <Separator />

            <div class="flex items-center justify-between gap-2">
              <span>{{ t('pages.account.details.exchangeRateLiveUpdate') }}</span>

              {{
                currenciesMap[account.currencyCode].liveRateUpdate
                  ? t('pages.account.details.enabled')
                  : t('pages.account.details.disabled')
              }}
            </div>
          </div>
        </Collapsible.CollapsibleContent>
      </Collapsible.Collapsible>
    </div>
  </Tabs.TabsContent>
</template>
