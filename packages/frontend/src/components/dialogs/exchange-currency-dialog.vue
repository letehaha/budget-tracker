<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import ExchangeCurrencyForm from '@/components/forms/exchange-currency-form.vue';
import type { PortfolioModel } from '@bt/shared/types';
import { useVModel } from '@vueuse/core';

const props = defineProps<{
  portfolioId: number;
  portfolio: PortfolioModel;
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'update:open', value: boolean): void;
}>();

const isOpen = useVModel(props, 'open', emit, { passive: true });

const handleSuccess = () => {
  isOpen.value = false;
  emit('success');
};

const handleCancel = () => {
  isOpen.value = false;
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('dialogs.exchangeCurrency.title') }}</template>
    <template #description>{{ $t('dialogs.exchangeCurrency.description') }}</template>

    <ExchangeCurrencyForm
      :portfolio-id="portfolioId"
      :portfolio="portfolio"
      @success="handleSuccess"
      @cancel="handleCancel"
    />
  </ResponsiveDialog>
</template>
