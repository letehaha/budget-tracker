<script setup lang="ts">
import * as Dialog from '@/components/lib/ui/dialog';
import { ref } from 'vue';

import DialogContent from './dialog-content.vue';

const isOpen = ref(false);
</script>

<template>
  <Dialog.Dialog v-model:open="isOpen">
    <Dialog.DialogTrigger as-child>
      <slot />
    </Dialog.DialogTrigger>
    <Dialog.DialogContent custom-close class="max-h-[90dvh] w-full max-w-[900px] bg-card p-0">
      <DialogContent @close-modal="isOpen = false" />
    </Dialog.DialogContent>
  </Dialog.Dialog>
</template>
