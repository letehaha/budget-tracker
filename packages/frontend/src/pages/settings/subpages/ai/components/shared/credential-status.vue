<template>
  <DesktopOnlyTooltip v-if="iconOnly" :content="statusText">
    <component :is="statusIcon" :class="cn('mt-0.5 size-5 shrink-0', statusColorClass)" />
  </DesktopOnlyTooltip>

  <span v-else class="flex items-center gap-1.5">
    <component :is="statusIcon" :class="cn('size-4 shrink-0', statusColorClass)" />
    <span class="text-muted-foreground text-xs">{{ statusText }}</span>
  </span>
</template>

<script setup lang="ts">
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useDateLocale } from '@/composable/use-date-locale';
import { cn } from '@/lib/utils';
import { AIApiKeyStatus } from '@bt/shared/types';
import { CheckCircleIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  status: AIApiKeyStatus;
  lastValidatedAt: string;
  invalidatedAt?: string;
  /** Icon alone with the verdict in its tooltip, for rows with no room for a line of text. */
  iconOnly?: boolean;
}>();

const { t } = useI18n();
const { formatDistanceToNow } = useDateLocale();

const isInvalid = computed(() => props.status === 'invalid');

const statusIcon = computed(() => (isInvalid.value ? TriangleAlertIcon : CheckCircleIcon));
const statusColorClass = computed(() => (isInvalid.value ? 'text-destructive-text' : 'text-success-text'));

// A failing credential is described by when it broke, a working one by its last successful check.
const statusText = computed(() => {
  const date = new Date(isInvalid.value ? (props.invalidatedAt ?? props.lastValidatedAt) : props.lastValidatedAt);
  const timeAgo = formatDistanceToNow(date, { addSuffix: true });

  return isInvalid.value
    ? t('settings.ai.credentialStatus.failed', { timeAgo })
    : t('settings.ai.credentialStatus.validated', { timeAgo });
});
</script>
