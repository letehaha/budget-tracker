<template>
  <router-link
    :to="{
      name: ROUTES_NAMES.account,
      params: { id: account.id },
    }"
    class="hover:bg-accent max-xs:justify-between max-xs:items-center max-xs:gap-5 max-xs:py-2 xs:rounded-lg xs:flex-col relative flex h-full gap-3 border p-4 shadow-xs"
  >
    <div class="flex items-center gap-4 overflow-hidden">
      <template v-if="props.account.bankDataProviderConnectionId">
        <div class="size-6">
          <template v-if="connectionDetails">
            <BankProviderLogo class="size-6" :provider="connectionDetails.providerType" />
          </template>
        </div>
      </template>
      <div class="xs:max-w-[calc(100%-60px)] truncate text-base tracking-wide whitespace-nowrap">
        {{ account.name || t('accounts.noNameSet') }}
      </div>
    </div>
    <div class="xs:text-lg font-semibold whitespace-nowrap">
      {{ formatBalance(account) }}
    </div>
  </router-link>
</template>

<script setup lang="ts">
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import { useFormatCurrency } from '@/composable';
import { useBankConnectionDetails } from '@/composable/data-queries/bank-providers/bank-connection-details';
import { ROUTES_NAMES } from '@/routes/constants';
import { AccountModel } from '@bt/shared/types';
import { toRef } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const props = defineProps<{ account: AccountModel }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { data: connectionDetails } = useBankConnectionDetails({
  connectionId: toRef(() => props.account.bankDataProviderConnectionId!),
});

const formatBalance = (account: AccountModel) =>
  formatAmountByCurrencyCode(account.currentBalance - account.creditLimit, account.currencyCode);
</script>
