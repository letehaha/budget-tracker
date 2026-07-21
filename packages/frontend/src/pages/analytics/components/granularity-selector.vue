<template>
  <Select :model-value="modelValue" @update:model-value="emit('update:modelValue', $event as T)">
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

<script setup lang="ts" generic="T extends string">
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/lib/ui/select';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: T;
  // The granularities this report accepts, in display order. Passing the endpoint's
  // own tuple keeps the selector from offering a value the API would reject.
  granularities: readonly T[];
  // i18n key prefix; each option's label reads `${labelKeyPrefix}.${value}`.
  labelKeyPrefix: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: T];
}>();

const { t } = useI18n();

const options = computed(() =>
  props.granularities.map((value) => ({
    value,
    label: t(`${props.labelKeyPrefix}.${value}`),
  })),
);
</script>
