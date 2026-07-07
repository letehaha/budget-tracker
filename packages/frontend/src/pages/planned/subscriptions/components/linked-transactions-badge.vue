<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { cn } from '@/lib/utils';
import { Link2Icon } from '@lucide/vue';

defineProps<{ count: number }>();
</script>

<template>
  <ResponsiveTooltip :content="$t('planned.subscriptions.linkedTransactions', { count }, count)">
    <Button
      variant="ghost"
      :aria-label="$t('planned.subscriptions.linkedTransactions', { count }, count)"
      :class="
        cn(
          'text-muted-foreground bg-muted/60 hover:bg-muted h-6 min-w-6 gap-1 rounded-full px-2 text-xs font-medium tabular-nums',
          count === 0 && 'opacity-60',
        )
      "
    >
      <Link2Icon class="size-3 shrink-0" />
      {{ count }}
    </Button>
  </ResponsiveTooltip>
</template>
