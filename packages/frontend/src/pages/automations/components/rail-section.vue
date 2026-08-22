<script setup lang="ts">
import { Card } from '@/components/lib/ui/card';
import { cn } from '@/lib/utils';
import { type Component } from 'vue';

defineProps<{
  icon: Component;
  tone: 'when' | 'then' | 'check';
  /** Draws the connector to the next rail section. */
  connected?: boolean;
}>();

const TONE_CLASSES: Record<'when' | 'then' | 'check', string> = {
  when: 'bg-automation-when/10 text-automation-when',
  then: 'bg-primary/10 text-primary-text',
  check: 'bg-success/10 text-success-text',
};
</script>

<template>
  <section class="grid grid-cols-1 @2xl/editor:grid-cols-[2.25rem_minmax(0,1fr)] @2xl/editor:gap-x-4">
    <div class="hidden flex-col items-center @2xl/editor:flex">
      <span :class="cn('flex size-9 shrink-0 items-center justify-center rounded-xl', TONE_CLASSES[tone])">
        <component :is="icon" class="size-4" />
      </span>
      <span v-if="connected" class="bg-border my-1.5 w-px flex-1" />
    </div>

    <div :class="cn(connected && '@2xl/editor:pb-6')">
      <Card class="flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center gap-2.5">
          <span
            :class="
              cn('flex size-7 shrink-0 items-center justify-center rounded-lg @2xl/editor:hidden', TONE_CLASSES[tone])
            "
          >
            <component :is="icon" class="size-3.5" />
          </span>
          <slot name="header" />
        </div>
        <slot />
      </Card>
      <span v-if="connected" class="bg-border mx-auto block h-5 w-px @2xl/editor:hidden" />
    </div>
  </section>
</template>
