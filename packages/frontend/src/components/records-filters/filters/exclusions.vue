<template>
  <div class="grid gap-3">
    <div class="flex items-center gap-2">
      <p class="text-sm">{{ $t('transactions.filters.refundsFilter.label') }}</p>
      <PillTabs
        :items="filterOperationItems"
        :model-value="refundFilter"
        size="sm"
        @update:model-value="$emit('update:refund-filter', $event as FILTER_OPERATION)"
      />
    </div>

    <div class="flex items-center gap-2">
      <p class="text-sm">{{ $t('transactions.filters.transferFilter.label') }}</p>
      <PillTabs
        :items="filterOperationItems"
        :model-value="transferFilter"
        size="sm"
        @update:model-value="$emit('update:transfer-filter', $event as FILTER_OPERATION)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { FILTER_OPERATION } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  refundFilter: FILTER_OPERATION;
  transferFilter: FILTER_OPERATION;
}>();

defineEmits<{
  'update:refund-filter': [value: FILTER_OPERATION];
  'update:transfer-filter': [value: FILTER_OPERATION];
}>();

const filterOperationItems = computed(() => [
  { value: FILTER_OPERATION.all, label: t('transactions.filters.filterOperation.all') },
  { value: FILTER_OPERATION.exclude, label: t('transactions.filters.filterOperation.exclude') },
  { value: FILTER_OPERATION.only, label: t('transactions.filters.filterOperation.only') },
]);
</script>
