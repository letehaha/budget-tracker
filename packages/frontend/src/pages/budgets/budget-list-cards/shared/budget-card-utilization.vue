<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  utilizationRate: number;
}>();

const colorClass = computed(() => {
  if (props.utilizationRate > 90) return 'text-app-expense-color';
  if (props.utilizationRate > 70) return 'text-warning-text';
  return 'text-success-text';
});

const bgColorClass = computed(() => {
  if (props.utilizationRate > 90) return 'bg-app-expense-color';
  if (props.utilizationRate > 70) return 'bg-warning-text';
  return 'bg-success-text';
});

const clampedRate = computed(() => Math.min(props.utilizationRate, 100));
</script>

<template>
  <div class="mt-3">
    <div class="mb-1 flex items-center justify-between text-xs">
      <span class="text-muted-foreground">{{ $t('budgets.list.used') }}</span>
      <span :class="['font-medium tabular-nums', colorClass]">
        {{ Math.round(utilizationRate) }}%
      </span>
    </div>
    <div class="bg-muted h-1.5 overflow-hidden rounded-full">
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="bgColorClass"
        :style="{ width: `${clampedRate}%` }"
      />
    </div>
  </div>
</template>
