<script setup lang="ts">
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ref } from 'vue';

import ManageTransactionDialogContent from './dialog-content.vue';

const isOpen = ref(false);
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
</script>

<template>
  <!-- Desktop: Dialog -->
  <Dialog.Dialog v-if="!isMobile" v-model:open="isOpen">
    <Dialog.DialogTrigger as-child>
      <slot />
    </Dialog.DialogTrigger>
    <Dialog.DialogContent custom-close class="bg-card max-h-[90dvh] w-full max-w-[900px] p-0">
      <Dialog.DialogTitle class="sr-only">Manage transaction</Dialog.DialogTitle>
      <Dialog.DialogDescription class="sr-only">Create or edit a transaction</Dialog.DialogDescription>
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
