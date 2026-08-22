<script setup lang="ts">
import { useAccountGroupsQuery } from '@/composable/data-queries/account-groups';
import type { RecordId } from '@bt/shared/types';
import { computed } from 'vue';

import RefMultiSelect from './ref-multi-select.vue';

defineProps<{ modelValue: RecordId[]; placeholder: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: RecordId[]] }>();

const { data: groups } = useAccountGroupsQuery();

const options = computed(() => (groups.value ?? []).map((group) => ({ id: group.id as RecordId, name: group.name })));
</script>

<template>
  <RefMultiSelect
    :model-value="modelValue"
    :options="options"
    :placeholder="placeholder"
    @update:model-value="(value) => emit('update:modelValue', value)"
  />
</template>
