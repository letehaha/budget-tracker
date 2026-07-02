<script setup lang="ts">
import { ensureChunkLoaded } from '@/i18n';
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { AccountModel, type TransactionModel } from '@bt/shared/types';
import { useVModel } from '@vueuse/core';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

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

const { t } = useI18n();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
const isOpen = useVModel(props, 'open', emit, { passive: true, defaultValue: false });
</script>

<template>
  <Dialog.Dialog v-if="!isMobile" v-model:open="isOpen">
    <Dialog.DialogTrigger as-child>
      <slot />
    </Dialog.DialogTrigger>
    <Dialog.DialogContent custom-close class="bg-card max-h-[90dvh] w-full max-w-lg p-0">
      <Dialog.DialogTitle class="sr-only">{{ t('loans.detail.payment.title') }}</Dialog.DialogTitle>
      <Dialog.DialogDescription class="sr-only">
        {{ t('loans.detail.payment.description') }}
      </Dialog.DialogDescription>
      <LoanPaymentForm
        v-if="i18nReady"
        :loan-account="loanAccount"
        :transaction="transaction"
        :opposite-transaction="oppositeTransaction"
        @close-modal="isOpen = false"
      />
    </Dialog.DialogContent>
  </Dialog.Dialog>

  <Drawer.Drawer v-else v-model:open="isOpen">
    <Drawer.DrawerTrigger class="w-full" as-child>
      <slot />
    </Drawer.DrawerTrigger>
    <Drawer.DrawerContent custom-indicator>
      <Drawer.DrawerTitle class="sr-only">{{ t('loans.detail.payment.title') }}</Drawer.DrawerTitle>
      <Drawer.DrawerDescription class="sr-only">
        {{ t('loans.detail.payment.description') }}
      </Drawer.DrawerDescription>
      <LoanPaymentForm
        v-if="i18nReady"
        :loan-account="loanAccount"
        :transaction="transaction"
        :opposite-transaction="oppositeTransaction"
        @close-modal="isOpen = false"
      />
    </Drawer.DrawerContent>
  </Drawer.Drawer>
</template>
