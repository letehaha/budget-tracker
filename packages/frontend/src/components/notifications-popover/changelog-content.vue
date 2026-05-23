<script setup lang="ts">
import { ChangelogNotificationPayload } from '@bt/shared/types';
import { ExternalLinkIcon } from '@lucide/vue';

withDefaults(
  defineProps<{
    payload: ChangelogNotificationPayload;
    unread?: boolean;
  }>(),
  { unread: false },
);

const handleLinkClick = (event: Event, url: string) => {
  event.stopPropagation();
  window.open(url, '_blank', 'noopener,noreferrer');
};
</script>

<template>
  <div>
    <p v-if="payload.releaseName" :class="['line-clamp-2 text-sm', unread ? 'font-semibold' : 'font-medium']">
      {{ payload.releaseName }}
    </p>
    <button
      v-if="payload.releaseUrl"
      class="text-primary mt-1 flex items-center gap-1 text-xs hover:underline"
      @click="handleLinkClick($event, payload.releaseUrl)"
    >
      {{ $t('notifications.viewOnGitHub') }}
      <ExternalLinkIcon class="size-3" />
    </button>
  </div>
</template>
