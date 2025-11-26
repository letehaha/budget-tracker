<template>
  <div class="border-destructive -mx-3 rounded-lg border p-3">
    <DeleteCurrency
      :currency="currency"
      :is-form-disabled="isFormDisabled"
      @submit="emit('submit')"
      @trigger-disabled="emit('trigger-disabled', $event)"
    />

    <div class="my-4 h-px w-full bg-white/20" />

    <SetBaseCurrency
      :currency="currency"
      :is-form-disabled="isFormDisabled"
      @submit="emit('submit')"
      @trigger-disabled="emit('trigger-disabled', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { CurrencyWithExchangeRate } from '../types';
import DeleteCurrency from './delete-currency.vue';
import SetBaseCurrency from './set-base-currency.vue';

defineProps<{
  currency: CurrencyWithExchangeRate;
  isFormDisabled: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  'trigger-disabled': [value: boolean];
}>();
</script>
