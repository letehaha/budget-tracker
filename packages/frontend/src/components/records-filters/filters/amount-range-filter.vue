<template>
  <div class="flex gap-2">
    <InputField
      :model-value="amountGte"
      :label="$t('transactions.filters.amountRange.from')"
      :placeholder="$t('transactions.filters.amountRange.placeholderFrom')"
      @update:model-value="$emit('update:amount-gte', $event)"
    />
    <InputField
      :model-value="amountLte"
      :label="$t('transactions.filters.amountRange.to')"
      :placeholder="$t('transactions.filters.amountRange.placeholderTo')"
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
