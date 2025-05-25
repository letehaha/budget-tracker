<template>
  <div class="flex items-center justify-between">
    <p>Filters:</p>

    <Dialog.Dialog :open="open" @update:open="$emit('update:open', $event)">
      <Dialog.DialogTrigger as-child>
        <UiButton variant="ghost" size="icon" class="ml-auto">
          <div class="relative">
            <ListFilterIcon />

            <template v-if="isAnyFiltersApplied">
              <div class="bg-primary absolute -right-1 -top-1 size-3 rounded-full" />
            </template>
          </div>
        </UiButton>
      </Dialog.DialogTrigger>
      <Dialog.DialogContent class="max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-md">
        <Dialog.DialogHeader class="mb-6">
          <Dialog.DialogTitle> Select filters </Dialog.DialogTitle>
        </Dialog.DialogHeader>

        <slot />
      </Dialog.DialogContent>
    </Dialog.Dialog>
  </div>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Dialog from '@/components/lib/ui/dialog';
import { ListFilterIcon } from 'lucide-vue-next';

defineProps({
  open: {
    type: Boolean,
    required: true,
  },
  isAnyFiltersApplied: {
    type: Boolean,
    required: true,
  },
});

defineEmits(['update:open']);
</script>
