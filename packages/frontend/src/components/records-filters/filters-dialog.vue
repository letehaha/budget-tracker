<template>
  <div class="flex items-center justify-between">
    <p>Filters:</p>

    <ResponsiveDialog :open="open" @update:open="$emit('update:open', $event)">
      <template #trigger>
        <UiButton variant="ghost" size="icon" class="ml-auto">
          <div class="relative">
            <ListFilterIcon />

            <template v-if="isAnyFiltersApplied">
              <div class="bg-primary absolute -right-1 -top-1 size-3 rounded-full" />
            </template>
          </div>
        </UiButton>
      </template>

      <template #title> Select filters </template>

      <div class="max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-md">
        <slot />
      </div>
    </ResponsiveDialog>
  </div>
</template>

<script lang="ts" setup>
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ListFilterIcon } from 'lucide-vue-next';

defineProps<{ open: boolean; isAnyFiltersApplied: boolean }>();

defineEmits(['update:open']);
</script>
