<template>
  <div class="bg-muted/30 rounded-md border px-4 py-3">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div class="flex min-w-0 items-baseline gap-2">
        <span class="truncate font-medium">{{ account.originalName }}</span>
        <span class="text-muted-foreground text-xs whitespace-nowrap">
          {{
            $t('pages.importExport.ynabImport.accountRow.transactionsCount', {
              count: account.transactionCount,
            })
          }}
        </span>
      </div>
      <div class="text-muted-foreground text-xs whitespace-nowrap">
        {{ $t('pages.importExport.ynabImport.accountRow.startingBalance') }}:
        <span class="text-foreground ml-1 text-sm font-semibold">
          {{ formattedStartingBalance }}
        </span>
      </div>
    </div>

    <div class="max-w-xs">
      <SelectField
        :model-value="selectedCurrency"
        :values="currencyOptions"
        label-key="displayLabel"
        value-key="code"
        with-search
        :search-keys="['code', 'currency']"
        :label="$t('pages.importExport.ynabImport.accountRow.currencyLabel')"
        :placeholder="$t('pages.importExport.ynabImport.accountRow.currencyPlaceholder')"
        :error-message="currencyErrorMessage"
        @update:model-value="onCurrencySelected"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { formatUIAmount } from '@/js/helpers';
import type { YnabAccountMappingValue, YnabParseAccount } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import type { CurrencyOption } from './preview-step.vue';

const CURRENCY_CODE_LENGTH = 3;

const props = defineProps<{
  account: YnabParseAccount;
  mapping: YnabAccountMappingValue | undefined;
  currencyOptions: CurrencyOption[];
}>();

const emit = defineEmits<{
  (e: 'update', mapping: YnabAccountMappingValue): void;
}>();

const { t } = useI18n();

const formattedStartingBalance = computed(() =>
  formatUIAmount(props.account.startingBalance, {
    currency: props.mapping?.currencyCode || props.account.detectedCurrency || undefined,
  }),
);

const selectedCurrency = computed<CurrencyOption | null>(() => {
  if (!props.mapping?.currencyCode) return null;
  return props.currencyOptions.find((c) => c.code === props.mapping!.currencyCode) ?? null;
});

const currencyErrorMessage = computed(() => {
  if (props.mapping?.currencyCode.length === CURRENCY_CODE_LENGTH) return undefined;
  return t('pages.importExport.ynabImport.accountRow.currencyInvalid');
});

function onCurrencySelected(currency: CurrencyOption | null) {
  if (!currency) return;
  emit('update', { currencyCode: currency.code });
}
</script>
