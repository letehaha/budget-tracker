<template>
  <div class="space-y-0.5">
    <DesktopOnlyTooltip v-if="hint" :content="hint">
      <p class="text-muted-foreground inline-block cursor-help text-xs font-medium tracking-wide uppercase">
        {{ label }}
        <InfoIcon class="ml-0.5 inline size-3" />
      </p>
    </DesktopOnlyTooltip>
    <p v-else class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      {{ label }}
    </p>

    <p
      class="text-base font-semibold"
      :class="{
        'text-app-income-color': tone === 'positive',
        'text-app-expense-color': tone === 'negative',
        'text-base': !emphasize,
        'text-lg': emphasize,
      }"
    >
      {{ value }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { InfoIcon } from 'lucide-vue-next';

defineProps<{
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
  emphasize?: boolean;
  hint?: string;
}>();
</script>
