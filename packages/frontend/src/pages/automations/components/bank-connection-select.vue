<script setup lang="ts">
import { useBankConnectionsQuery } from '@/composable/data-queries/bank-connections';
import type { RecordId } from '@bt/shared/types';
import { computed } from 'vue';

import RefMultiSelect from './ref-multi-select.vue';

defineProps<{ modelValue: RecordId[]; placeholder: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: RecordId[]] }>();

const { data: connections } = useBankConnectionsQuery();

const options = computed(() =>
  (connections.value ?? []).map((connection) => ({
    id: connection.id as RecordId,
    name: connection.bankName || connection.providerName,
  })),
);
</script>

<template>
  <RefMultiSelect
    :model-value="modelValue"
    :options="options"
    :placeholder="placeholder"
    @update:model-value="(value) => emit('update:modelValue', value)"
  />
</template>
