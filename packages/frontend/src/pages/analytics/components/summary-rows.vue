<template>
  <div class="border-border bg-card rounded-lg border px-4 py-1">
    <template v-if="loading">
      <div v-for="i in skeletonCount" :key="i" class="flex animate-pulse items-center justify-between py-2.5">
        <div class="bg-muted h-3 w-20 rounded" />
        <div class="bg-muted h-5 w-28 rounded" />
      </div>
    </template>
    <template v-else>
      <template v-for="(item, index) in items" :key="item.label">
        <slot v-if="index > 0" name="divider" :index="index">
          <div class="bg-border h-px" />
        </slot>
        <div class="flex items-baseline justify-between gap-3 py-2.5">
          <span class="text-muted-foreground flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase">
            <span v-if="item.color" class="size-2 shrink-0 rounded-xs" :style="{ background: item.color }" />
            {{ item.label }}
          </span>
          <span
            :class="
              cn(
                'flex items-baseline gap-1.5 text-right text-base leading-tight font-extrabold tabular-nums',
                item.valueClass,
              )
            "
          >
            {{ item.value }}
            <SummaryChangeBadge
              v-if="item.change !== undefined"
              :change="item.change"
              :invert-colors="item.invertColors"
              :comparison-period-label="item.comparisonPeriodLabel"
            />
            <span v-if="item.hint" class="text-muted-foreground text-xs font-medium">{{ item.hint }}</span>
          </span>
        </div>
      </template>
      <template v-if="$slots.default">
        <div class="bg-border h-px" />
        <div class="py-2.5"><slot /></div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';

import SummaryChangeBadge from '../subpages/cash-flow/components/summary-change-badge.vue';

export interface SummaryRowItem {
  label: string;
  /** Already formatted for display. */
  value: string;
  change?: number;
  invertColors?: boolean;
  comparisonPeriodLabel?: string;
  hint?: string;
  color?: string;
  valueClass?: string;
}

withDefaults(defineProps<{ items: SummaryRowItem[]; loading?: boolean; skeletonCount?: number }>(), {
  skeletonCount: 2,
});
</script>
