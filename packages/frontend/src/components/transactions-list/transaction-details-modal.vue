<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';

const open = defineModel<boolean>('open', { required: true });

defineProps<{
  /**
   * Narrow-layout flag supplied by the view: the list derives it from the
   * viewport, the table from its container width — so it stays a prop here
   * instead of being computed inside.
   */
  mobile: boolean;
  /** Compact (max-w-lg) desktop dialog instead of the full-width editor. */
  isCompact?: boolean;
}>();
</script>

<template>
  <Drawer.Drawer v-if="mobile" v-model:open="open">
    <Drawer.DrawerContent custom-indicator>
      <Drawer.DrawerTitle class="sr-only">{{ $t('transactions.list.detailsTitle') }}</Drawer.DrawerTitle>
      <Drawer.DrawerDescription class="sr-only">{{
        $t('transactions.list.detailsDescription')
      }}</Drawer.DrawerDescription>
      <slot />
    </Drawer.DrawerContent>
  </Drawer.Drawer>

  <Dialog.Dialog v-else v-model:open="open">
    <Dialog.DialogContent
      custom-close
      :class="['bg-card max-h-[90dvh] w-full p-0', isCompact ? 'max-w-lg' : 'max-w-225']"
    >
      <Dialog.DialogTitle class="sr-only">{{ $t('transactions.list.detailsTitle') }}</Dialog.DialogTitle>
      <Dialog.DialogDescription class="sr-only">{{
        $t('transactions.list.detailsDescription')
      }}</Dialog.DialogDescription>
      <slot />
    </Dialog.DialogContent>
  </Dialog.Dialog>
</template>
