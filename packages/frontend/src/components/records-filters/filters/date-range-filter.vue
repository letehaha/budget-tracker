<template>
  <DateField
    :model-value="start"
    :calendar-options="{
      maxDate: end,
    }"
    label="From date"
    @update:model-value="$emit('update:start', $event)"
  />
  <DateField
    :model-value="end"
    :calendar-options="{
      minDate: start,
    }"
    label="To date"
    @update:model-value="$emit('update:end', $event)"
  />
</template>

<script lang="ts" setup>
import DateField from '@/components/fields/date-field.vue';

defineProps({
  start: {
    type: Date,
    default: null,
  },
  end: {
    type: Date,
    default: null,
  },
});

defineEmits(['update:start', 'update:end']);
</script>
