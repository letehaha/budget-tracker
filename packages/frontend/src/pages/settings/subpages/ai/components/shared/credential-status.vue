<template>
  <DesktopOnlyTooltip :content="statusText">
    <component :is="statusIcon" :class="cn('mt-0.5 size-5 shrink-0', statusColorClass)" />
  </DesktopOnlyTooltip>
</template>

<script setup lang="ts">
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useDateLocale } from '@/composable/use-date-locale';
import { cn } from '@/lib/utils';
import { AIConnectionStatus } from '@bt/shared/types';
import { CheckCircleIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  status: AIConnectionStatus;
  lastValidatedAt: string;
  invalidatedAt?: string;
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
