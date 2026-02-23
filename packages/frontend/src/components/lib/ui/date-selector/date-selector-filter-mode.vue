<script lang="ts" setup>
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { type DateSelectorFilterMode } from './types';

const props = withDefaults(
  defineProps<{
    modelValue: DateSelectorFilterMode;
    allowedModes?: DateSelectorFilterMode[];
  }>(),
  {
    allowedModes: () => ['is', 'before', 'after', 'between'],
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: DateSelectorFilterMode];
}>();

const { t } = useI18n();

const allModes = computed(() => [
  { value: 'is' as const, label: t('common.dateSelector.filterModes.is') },
  { value: 'before' as const, label: t('common.dateSelector.filterModes.before') },
  { value: 'after' as const, label: t('common.dateSelector.filterModes.after') },
  { value: 'between' as const, label: t('common.dateSelector.filterModes.between') },
]);

const modes = computed(() => allModes.value.filter((m) => props.allowedModes.includes(m.value)));
</script>

<template>
  <PillTabs
    :items="modes"
    :model-value="modelValue"
    size="sm"
    @update:model-value="emit('update:modelValue', $event as DateSelectorFilterMode)"
  />
</template>
