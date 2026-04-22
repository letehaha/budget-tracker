<template>
  <span
    v-if="isVisible"
    class="bg-success-text/70 dark:text-success-foreground inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium text-white"
  >
    {{ $t('common.new') }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /**
   * ISO date string (e.g. '2026-04-01') representing when
   * the feature was introduced. The badge hides after `ttlDays`.
   */
  since: string;
  /** Number of days the badge stays visible. Defaults to 60. */
  ttlDays?: number;
}>();

const DEFAULT_TTL_DAYS = 60;

const isVisible = computed(() => {
  const sinceDate = new Date(props.since);
  const ttl = props.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(sinceDate.getTime() + ttl * 24 * 60 * 60 * 1000);

  return Date.now() < expiresAt.getTime();
});
</script>
