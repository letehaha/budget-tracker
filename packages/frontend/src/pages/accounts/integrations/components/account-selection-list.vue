<template>
  <div class="flex flex-col gap-2">
    <div class="flex min-h-8 items-center justify-between gap-2">
      <div class="flex items-baseline gap-1.5">
        <span class="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
          {{ $t('pages.integrations.common.availableLabel') }}
        </span>
        <span class="text-muted-foreground/70 text-xs font-medium tabular-nums">
          {{ accounts.length }}
        </span>
      </div>
      <UiButton v-if="accounts.length > 1" variant="ghost-primary" size="sm" @click="toggleAll">
        {{ allSelected ? $t('pages.integrations.common.clearAll') : $t('pages.integrations.common.selectAll') }}
      </UiButton>
    </div>

    <AccountSelectionRow
      v-for="account in accounts"
      :key="account.externalId"
      :account="account"
      :provider-type="providerType"
      :selected="selectedIds.includes(account.externalId)"
      :meta="institutionNameOf(account)"
      :currency-override="currencyOverrides[account.externalId] ?? null"
      @toggle="toggleAccount(account.externalId)"
      @update:currency-override="(code) => setCurrencyOverride({ externalId: account.externalId, code })"
    />

    <p v-if="missingCurrencyCount > 0" class="text-warning-text flex items-start gap-2 text-xs">
      <TriangleAlertIcon class="mt-0.5 size-3.5 shrink-0" />
      {{ $t('pages.integrations.common.currencyPicker.missingCount', missingCurrencyCount) }}
    </p>
  </div>
</template>

<script lang="ts" setup>
import type { AvailableAccount } from '@/api/bank-data-providers';
import UiButton from '@/components/lib/ui/button/Button.vue';
import type { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { TriangleAlertIcon } from '@lucide/vue';
import { computed } from 'vue';

import { applyCurrencyOverride, countMissingCurrencySelections } from '../utils/currency-overrides';
import AccountSelectionRow from './account-selection-row.vue';

const props = defineProps<{
  accounts: AvailableAccount[];
  providerType?: BANK_PROVIDER_TYPE;
}>();

// Selected external IDs, two-way bound by the parent connector.
const selectedIds = defineModel<string[]>({ required: true });

// externalId → user-picked currency for accounts the provider listed without
// one (NO_CURRENCY_CODE). The parent sends these along with the connect call.
const currencyOverrides = defineModel<Record<string, string>>('currencyOverrides', { default: () => ({}) });

const setCurrencyOverride = ({ externalId, code }: { externalId: string; code: string | null }) => {
  currencyOverrides.value = applyCurrencyOverride({ overrides: currencyOverrides.value, externalId, code });
};

const allSelected = computed(() => props.accounts.length > 0 && selectedIds.value.length === props.accounts.length);

const missingCurrencyCount = computed(() =>
  countMissingCurrencySelections({
    accounts: props.accounts,
    selectedIds: selectedIds.value,
    overrides: currencyOverrides.value,
  }),
);

const toggleAccount = (externalId: string) => {
  selectedIds.value = selectedIds.value.includes(externalId)
    ? selectedIds.value.filter((id) => id !== externalId)
    : [...selectedIds.value, externalId];
};

const toggleAll = () => {
  selectedIds.value = allSelected.value ? [] : props.accounts.map((account) => account.externalId);
};

// `metadata` is an untyped bag from the provider; read institutionName safely.
const institutionNameOf = (account: AvailableAccount): string =>
  typeof account.metadata?.institutionName === 'string' ? account.metadata.institutionName : '';
</script>
