<template>
  <Select :model-value="modelValue" @update:model-value="emit('update:modelValue', $event as Granularity)">
    <SelectTrigger class="w-[130px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>

<script setup lang="ts">
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/lib/ui/select';
import { endpointsTypes } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type Granularity = endpointsTypes.CashFlowGranularity;

defineProps<{
  modelValue: Granularity;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Granularity];
}>();

const { t } = useI18n();

const options = computed(() => [
  { value: 'monthly' as const, label: t('analytics.cashFlow.granularity.monthly') },
  { value: 'biweekly' as const, label: t('analytics.cashFlow.granularity.biweekly') },
  { value: 'weekly' as const, label: t('analytics.cashFlow.granularity.weekly') },
]);
</script>
