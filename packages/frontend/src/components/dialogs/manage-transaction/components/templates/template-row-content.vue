<script lang="ts" setup>
import { TRANSACTION_TYPES, type TransactionTemplateModel } from '@bt/shared/types';

import { TEMPLATE_STALE_REASON_KEYS, type TemplateStaleReason } from './template-staleness';

defineProps<{
  template: TransactionTemplateModel;
  amountLabel: string;
  staleReason: TemplateStaleReason | null;
}>();
</script>

<template>
  <span
    :class="[
      'size-2 shrink-0 rounded-full',
      template.transactionType === TRANSACTION_TYPES.income ? 'bg-app-income-color' : 'bg-app-expense-color',
    ]"
  />
  <span class="min-w-0 flex-1">
    <span class="block truncate text-sm">{{ template.name }}</span>
    <span v-if="staleReason" class="text-warning-text block truncate text-[11px] leading-tight">
      {{ $t(TEMPLATE_STALE_REASON_KEYS[staleReason]) }}
    </span>
  </span>
  <span class="text-muted-foreground shrink-0 text-xs tabular-nums">{{ amountLabel }}</span>
</template>
