<script setup lang="ts">
import { config } from '@/common/config';
import { ExternalLinkIcon } from '@lucide/vue';

defineProps<{
  // Docs path with a leading slash, optionally with an anchor, e.g. "/accounts/manage-accounts/#adjust-a-balance"
  path: string;
}>();
</script>

<template>
  <a
    :href="`${config.docsUrl}${path}`"
    target="_blank"
    rel="noopener noreferrer"
    class="text-primary-text inline-flex items-center gap-1 underline-offset-4 hover:underline"
  >
    <slot>{{ $t('common.actions.learnMore') }}</slot>
    <ExternalLinkIcon class="size-3 shrink-0" />
  </a>
</template>
