<script lang="ts" setup>
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { type DateSelectorFilterMode } from './types';

defineProps<{
  modelValue: DateSelectorFilterMode;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DateSelectorFilterMode];
}>();

const { t } = useI18n();

const modes = computed(() => [
  { value: 'is', label: t('common.dateSelector.filterModes.is') },
  { value: 'before', label: t('common.dateSelector.filterModes.before') },
  { value: 'after', label: t('common.dateSelector.filterModes.after') },
  { value: 'between', label: t('common.dateSelector.filterModes.between') },
]);
</script>

<template>
  <PillTabs
    :items="modes"
    :model-value="modelValue"
    size="sm"
    @update:model-value="emit('update:modelValue', $event as DateSelectorFilterMode)"
  />
</template>
