<template>
  <DesktopOnlyTooltip :content="$t('dialogs.categoryExclusions.badgeTooltip', count)">
    <span
      class="bg-warning-text/15 text-warning-text inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      :data-testid="testId"
    >
      <CircleOffIcon class="size-3" />
      {{ count }}
    </span>
  </DesktopOnlyTooltip>
</template>

<script lang="ts" setup>
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { CircleOffIcon } from '@lucide/vue';

defineProps<{
  count: number;
  testId: string;
}>();
</script>
