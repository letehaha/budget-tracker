<script setup lang="ts">
import type { NotificationStruct } from '@/api/notifications';
import { useDateLocale } from '@/composable/use-date-locale';
import {
  ChangelogNotificationPayload,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
  NotificationType,
  TagReminderNotificationPayload,
} from '@bt/shared/types';
import { AlertTriangleIcon, InfoIcon, SparklesIcon, TagIcon, WalletIcon, XIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

import ChangelogContent from './changelog-content.vue';
import DefaultContent from './default-content.vue';
import TagReminderContent from './tag-reminder-content.vue';

const props = defineProps<{
  notification: NotificationStruct;
}>();

const emit = defineEmits<{
  click: [notification: NotificationStruct];
  dismiss: [id: string];
}>();

const { t } = useI18n();
const { formatDistanceToNow } = useDateLocale();

const getIcon = (type: NotificationType) => {
  switch (type) {
    case NOTIFICATION_TYPES.budgetAlert:
      return WalletIcon;
    case NOTIFICATION_TYPES.system:
      return AlertTriangleIcon;
    case NOTIFICATION_TYPES.changelog:
      return SparklesIcon;
    case NOTIFICATION_TYPES.tagReminder:
      return TagIcon;
    default:
      return InfoIcon;
  }
};

const getIconBg = (type: NotificationType) => {
  switch (type) {
    case NOTIFICATION_TYPES.budgetAlert:
      return 'bg-orange-500';
    case NOTIFICATION_TYPES.system:
      return 'bg-blue-500';
    case NOTIFICATION_TYPES.changelog:
      return 'bg-purple-500';
    case NOTIFICATION_TYPES.tagReminder:
      return 'bg-amber-500';
    default:
      return 'bg-gray-500';
  }
};

const getTitle = (notification: NotificationStruct): string => {
  if (notification.type === NOTIFICATION_TYPES.changelog) {
    const payload = notification.payload as ChangelogNotificationPayload;
    return payload?.version
      ? t('notifications.newVersion', { version: payload.version })
      : t('notifications.newRelease');
  }
  return notification.title || '';
};

const formatRelativeTime = (date: Date | string) => {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

const handleClick = () => {
  emit('click', props.notification);
};

const handleDismiss = (event: Event) => {
  event.stopPropagation();
  emit('dismiss', props.notification.id);
};
</script>

<template>
  <div
    :class="[
      'group hover:bg-accent relative cursor-pointer px-4 py-3 transition-colors',
      notification.status === NOTIFICATION_STATUSES.unread && 'bg-accent/50',
    ]"
    @click="handleClick"
  >
    <div class="flex items-start gap-3">
      <div
        :class="['mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', getIconBg(notification.type)]"
      >
        <component :is="getIcon(notification.type)" class="size-4 text-white" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <p
            :class="[
              'line-clamp-2 text-sm',
              notification.status === NOTIFICATION_STATUSES.unread ? 'font-semibold' : 'font-medium',
            ]"
          >
            {{ getTitle(notification) }}
          </p>
          <button
            class="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            @click="handleDismiss"
          >
            <XIcon class="size-4" />
          </button>
        </div>

        <!-- Type-specific content -->
        <ChangelogContent
          v-if="notification.type === NOTIFICATION_TYPES.changelog"
          :payload="notification.payload as ChangelogNotificationPayload"
        />
        <TagReminderContent
          v-else-if="notification.type === NOTIFICATION_TYPES.tagReminder"
          :payload="notification.payload as TagReminderNotificationPayload"
        />
        <DefaultContent v-else :message="notification.message" />

        <p class="text-muted-foreground mt-1 text-xs">
          {{ formatRelativeTime(notification.createdAt) }}
        </p>
      </div>
    </div>
  </div>
</template>
