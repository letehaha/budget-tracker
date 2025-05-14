<template>
  <div>
    <p class="mb-2">Transaction type:</p>

    <RadioGroup
      :model-value="value"
      :default-value="null"
      class="flex flex-wrap gap-2"
      @update:model-value="$emit('update:value', $event)"
    >
      <label class="flex cursor-pointer items-center gap-2">
        <RadioGroupItem :value="null" />
        <p class="text-sm">Both</p>
      </label>
      <label class="flex cursor-pointer items-center gap-2">
        <RadioGroupItem :value="TRANSACTION_TYPES.income" />
        <p class="text-sm">Income</p>
      </label>
      <label class="flex cursor-pointer items-center gap-2">
        <RadioGroupItem :value="TRANSACTION_TYPES.expense" />
        <p class="text-sm">Expense</p>
      </label>
    </RadioGroup>
  </div>
</template>

<script lang="ts" setup>
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { TRANSACTION_TYPES } from '@bt/shared/types';

defineProps({
  value: {
    type: String,
    default: null,
  },
});

defineEmits(['update:value']);
</script>
