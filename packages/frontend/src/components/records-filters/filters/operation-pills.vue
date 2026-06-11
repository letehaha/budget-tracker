<template>
  <div class="flex items-center gap-2">
    <p class="shrink-0 text-sm">{{ label }}</p>
    <PillTabs
      :items="filterOperationItems"
      :model-value="modelValue"
      size="sm"
      @update:model-value="$emit('update:model-value', $event as FILTER_OPERATION)"
    />
  </div>
</template>

<script lang="ts" setup>
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { FILTER_OPERATION } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  label: string;
  modelValue: FILTER_OPERATION;
}>();

defineEmits<{
  'update:model-value': [value: FILTER_OPERATION];
}>();

const filterOperationItems = computed(() => [
  { value: FILTER_OPERATION.all, label: t('transactions.filters.filterOperation.all') },
  { value: FILTER_OPERATION.exclude, label: t('transactions.filters.filterOperation.exclude') },
  { value: FILTER_OPERATION.only, label: t('transactions.filters.filterOperation.only') },
]);
</script>
