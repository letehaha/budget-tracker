<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    :class="
      cn(
        'bg-muted/30 flex flex-col gap-1 rounded-md p-2 text-left',
        clickable &&
          'hover:bg-muted/50 focus-visible:ring-ring cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none',
      )
    "
    @click="clickable && emit('click')"
  >
    <span class="text-muted-foreground flex items-center gap-1 text-xs">
      <span>{{ label }}</span>
      <ResponsiveTooltip v-if="hint" :delay-duration="100" :content="hint">
        <InfoIcon class="size-3 cursor-help" @click.prevent.stop />
      </ResponsiveTooltip>
    </span>
    <span class="flex items-center gap-1.5 text-sm font-semibold tabular-nums" :class="toneClass">
      <slot name="valuePrefix" />
      <span class="truncate">{{ value }}</span>
    </span>
  </component>
</template>

<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { cn } from '@/lib/utils';
import { InfoIcon } from '@lucide/vue';
import { computed } from 'vue';

interface Props {
  label: string;
  value: string;
  tone?: 'income' | 'expense';
  clickable?: boolean;
  /** Optional helper text shown via an info-icon tooltip next to the label. */
  hint?: string;
}
const props = withDefaults(defineProps<Props>(), {
  tone: undefined,
  clickable: false,
  hint: undefined,
});

const emit = defineEmits<{
  click: [];
}>();

const toneClass = computed(() => {
  if (props.tone === 'income') return 'text-app-income-color';
  if (props.tone === 'expense') return 'text-app-expense-color';
  return '';
});
</script>
