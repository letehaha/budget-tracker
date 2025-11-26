<template>
  <div>
    <ExchangeRateForm
      :currency="currency"
      :is-form-disabled="isFormDisabled"
      @submit="emit('submit')"
      @trigger-disabled="isFormDisabled = $event"
    />

    <div class="my-4 h-px w-full bg-white/20" />

    <DangerZone
      :currency="currency"
      :is-form-disabled="isFormDisabled"
      @submit="emit('submit')"
      @trigger-disabled="isFormDisabled = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { CurrencyWithExchangeRate } from '../types';
import DangerZone from './danger-zone.vue';
import ExchangeRateForm from './exchange-rate-form.vue';

defineProps<{
  currency: CurrencyWithExchangeRate;
  deletionDisabled: boolean;
}>();

const emit = defineEmits<{
  submit: [];
}>();

const isFormDisabled = ref(false);
</script>
