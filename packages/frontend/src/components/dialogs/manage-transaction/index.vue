<script setup lang="ts">
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import ManageTransactionDialogContent from './dialog-content.vue';

const { t } = useI18n();
const isOpen = ref(false);
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

watch(isOpen, (open) => {
  if (open) {
    trackAnalyticsEvent({ event: 'transaction_creation_opened' });
  }
});
</script>

<template>
  <!-- Desktop: Dialog -->
  <Dialog.Dialog v-if="!isMobile" v-model:open="isOpen">
    <Dialog.DialogTrigger as-child>
      <slot />
    </Dialog.DialogTrigger>
    <Dialog.DialogContent custom-close class="bg-card max-h-[90dvh] w-full max-w-225 p-0">
      <Dialog.DialogTitle class="sr-only">{{ t('dialogs.manageTransaction.title') }}</Dialog.DialogTitle>
      <Dialog.DialogDescription class="sr-only">{{
        t('dialogs.manageTransaction.description')
      }}</Dialog.DialogDescription>
      <ManageTransactionDialogContent @close-modal="isOpen = false" />
    </Dialog.DialogContent>
  </Dialog.Dialog>

  <!-- Mobile: Drawer -->
  <Drawer.Drawer v-else v-model:open="isOpen">
    <Drawer.DrawerTrigger class="w-full" as-child>
      <slot />
    </Drawer.DrawerTrigger>
    <Drawer.DrawerContent custom-indicator>
      <ManageTransactionDialogContent @close-modal="isOpen = false" />
    </Drawer.DrawerContent>
  </Drawer.Drawer>
</template>
