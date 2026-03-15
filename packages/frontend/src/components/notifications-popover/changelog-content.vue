<script setup lang="ts">
import { ChangelogNotificationPayload } from '@bt/shared/types';
import { ExternalLinkIcon } from 'lucide-vue-next';

defineProps<{
  payload: ChangelogNotificationPayload;
}>();

const handleLinkClick = (event: Event, url: string) => {
  event.stopPropagation();
  window.open(url, '_blank', 'noopener,noreferrer');
};
</script>

<template>
  <div>
    <p v-if="payload.releaseName" class="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
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
