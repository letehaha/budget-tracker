<template>
  <div class="flex gap-2">
    <InputField
      :model-value="amountGte"
      label="Amount from (gte)"
      placeholder=">= than"
      @update:model-value="$emit('update:amount-gte', $event)"
    />
    <InputField
      :model-value="amountLte"
      label="To (lte)"
      placeholder="<= than"
      @update:model-value="$emit('update:amount-lte', $event)"
    />
  </div>
</template>

<script lang="ts" setup>
import InputField from '@/components/fields/input-field.vue';

defineProps({
  amountGte: {
    type: Number,
    default: null,
  },
  amountLte: {
    type: Number,
    default: null,
  },
});

defineEmits(['update:amount-gte', 'update:amount-lte']);
</script>
