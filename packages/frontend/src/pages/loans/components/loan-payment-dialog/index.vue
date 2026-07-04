<script setup lang="ts">
import { ensureChunkLoaded } from '@/i18n';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { AccountModel, type TransactionModel } from '@bt/shared/types';
import { useVModel } from '@vueuse/core';
import { ref } from 'vue';

import LoanPaymentForm from './loan-payment-form.vue';

// This dialog opens from routes that don't list `pages/loans` in their i18nChunks. Load it on mount
// and gate the form on completion — mergeLocaleMessage doesn't rerender already-mounted templates here,
// so the form must mount after the chunk merges or it shows raw key paths until reopened.
const i18nReady = ref(false);
ensureChunkLoaded('pages/loans').then(() => {
  i18nReady.value = true;
});

const props = withDefaults(
  defineProps<{
    open?: boolean;
    loanAccount: AccountModel;
    transaction?: TransactionModel;
    oppositeTransaction?: TransactionModel;
  }>(),
  { open: undefined, transaction: undefined, oppositeTransaction: undefined },
);

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const isOpen = useVModel(props, 'open', emit, { passive: true, defaultValue: false });
</script>

<template>
  <ResponsiveDialog
    v-model:open="isOpen"
    custom-close
    no-internal-scroll
    sr-only-header
    drawer-custom-indicator
    dialog-content-class="bg-card max-h-[90dvh] w-full max-w-lg p-0"
    drawer-content-class="px-0 pb-[env(safe-area-inset-bottom)]"
  >
    <template #trigger>
      <slot />
    </template>

    <template #title>{{ $t('loans.detail.payment.title') }}</template>
    <template #description>{{ $t('loans.detail.payment.description') }}</template>

    <LoanPaymentForm
      v-if="i18nReady"
      :loan-account="loanAccount"
      :transaction="transaction"
      :opposite-transaction="oppositeTransaction"
      @close-modal="isOpen = false"
    />
  </ResponsiveDialog>
</template>
