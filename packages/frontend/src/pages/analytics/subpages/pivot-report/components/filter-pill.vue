<script lang="ts">
import { cn } from '@/lib/utils';

/**
 * Shared chrome for the Pivot Report filter pills. Exposed as a plain function so
 * the self-triggering filter components (categories / payees / accounts) can apply
 * the identical pill styling through their `triggerClass` prop and stay visually
 * consistent with the Period pill this component renders. `active` tints the pill
 * to signal the filter is narrowing the report beyond its wide-open default.
 */
export const filterPillClass = ({ active }: { active: boolean }): string =>
  cn(
    'flex h-8 min-h-8 w-auto max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-normal',
    active
      ? 'border-primary/60 bg-primary/10 text-foreground hover:bg-primary/15'
      : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
  );
</script>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { ChevronDownIcon } from '@lucide/vue';
import { type Component, computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    active?: boolean;
    icon?: Component;
  }>(),
  { active: false, icon: undefined },
);

const pillClass = computed(() => filterPillClass({ active: props.active }));
</script>

<template>
  <Button type="button" variant="outline" :class="pillClass">
    <component :is="icon" v-if="icon" class="size-3.5 shrink-0 opacity-70" />
    <span class="text-muted-foreground shrink-0 text-xs">{{ label }}</span>
    <span class="text-foreground min-w-0 truncate font-medium">{{ value }}</span>
    <ChevronDownIcon class="size-3.5 shrink-0 opacity-50" />
  </Button>
</template>
