<script setup lang="ts">
import { ACCOUNT_CATEGORIES_TRANSLATION_KEYS } from '@/common/const';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import { useAccountAccess } from '@/composable/use-account-access';
import { useAccountCurrencyCode } from '@/composable/use-account-currency-code';
import { toLocalCurrencyNumber } from '@/js/helpers';
import { useCurrenciesStore } from '@/stores';
import { ACCOUNT_TYPES, AccountModel, isDedicatedFlowAccountCategory } from '@bt/shared/types';
import { ChevronDownIcon, ChevronUpIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, defineAsyncComponent, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

const CreditLimitEditPopover = defineAsyncComponent(() => import('./credit-limit-edit-popover.vue'));
const AccountCategoryEditPopover = defineAsyncComponent(() => import('./account-category-edit-popover.vue'));

const { t } = useI18n();

const props = defineProps<{
  account: AccountModel;
  tabName: string;
}>();

const { currenciesMap } = storeToRefs(useCurrenciesStore());
const isOpen = ref(false);

const isSystemAccount = computed(() => props.account.type === ACCOUNT_TYPES.system);
const currencyCode = useAccountCurrencyCode({ account: toRef(() => props.account) });
const { isOwner } = useAccountAccess(toRef(() => props.account));
// Loan and vehicle categories are locked to their dedicated flows on the backend.
const isCategoryEditable = computed(
  () => isOwner.value && !isDedicatedFlowAccountCategory(props.account.accountCategory),
);
</script>

<template>
  <Tabs.TabsContent :value="tabName">
    <div class="grid gap-4 py-6 text-sm">
      <div class="flex items-center justify-between gap-2">
        <span>{{ t('pages.account.details.creditLimit') }}</span>

        <div class="flex items-center gap-1.5">
          <span>{{ toLocalCurrencyNumber(account.creditLimit, { currency: currencyCode }) }} {{ currencyCode }}</span>

          <CreditLimitEditPopover v-if="isSystemAccount" :account="account" :currency-code="currencyCode" />
        </div>
      </div>
      <Separator />

      <div class="flex items-center justify-between gap-2">
        <span>{{ t('pages.account.details.initialBalance') }}</span>

        {{ toLocalCurrencyNumber(account.initialBalance, { currency: currencyCode }) }} {{ currencyCode }}
      </div>
      <Separator />
      <div class="flex items-center justify-between gap-2">
        <span>{{ t('pages.account.details.accountCategory') }}</span>

        <div class="flex items-center gap-1.5">
          <span class="capitalize">
            {{ t(ACCOUNT_CATEGORIES_TRANSLATION_KEYS[account.accountCategory]) }}
          </span>

          <AccountCategoryEditPopover v-if="isCategoryEditable" :account="account" />
        </div>
      </div>
      <Separator />

      <Collapsible.Collapsible v-model:open="isOpen">
        <Collapsible.CollapsibleTrigger class="w-full">
          <div class="flex items-center justify-between gap-2">
            <span>{{ t('pages.account.details.currency') }}</span>

            <div class="flex gap-2">
              {{ currencyCode }}

              <span v-if="currenciesMap[account.currencyCode]?.isDefaultCurrency">
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

              {{ currenciesMap[account.currencyCode]?.exchangeRate }}
            </div>

            <Separator />

            <div class="flex items-center justify-between gap-2">
              <span>{{ t('pages.account.details.exchangeRateLiveUpdate') }}</span>

              {{
                currenciesMap[account.currencyCode]?.liveRateUpdate
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
