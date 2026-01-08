<script setup lang="ts">
import type { NotificationStruct } from '@/api/notifications';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import {
  useDismissNotification,
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useNotifications,
  useUnreadNotificationsCount,
} from '@/composable/data-queries/notifications';
import { useDateLocale } from '@/composable/use-date-locale';
import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES, NotificationType } from '@bt/shared/types';
import {
  AlertTriangleIcon,
  BellIcon,
  BellOffIcon,
  InfoIcon,
  Loader2,
  SparklesIcon,
  WalletIcon,
  XIcon,
} from 'lucide-vue-next';
import { ref } from 'vue';

const isOpen = ref(false);

// Locale-aware date formatting
const { formatDistanceToNow } = useDateLocale();

// Queries - enabled once popover has been opened, then cached via staleTime
const { data: notifications, isLoading } = useNotifications();
const { data: unreadCount } = useUnreadNotificationsCount();

// Mutations
const markAsReadMutation = useMarkNotificationAsRead();
const markAllAsReadMutation = useMarkAllNotificationsAsRead();
const dismissMutation = useDismissNotification();

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case NOTIFICATION_TYPES.budgetAlert:
      return WalletIcon;
    case NOTIFICATION_TYPES.system:
      return AlertTriangleIcon;
    case NOTIFICATION_TYPES.changelog:
      return SparklesIcon;
    default:
      return InfoIcon;
  }
};

const getNotificationIconBg = (type: NotificationType) => {
  switch (type) {
    case NOTIFICATION_TYPES.budgetAlert:
      return 'bg-orange-500';
    case NOTIFICATION_TYPES.system:
      return 'bg-blue-500';
    case NOTIFICATION_TYPES.changelog:
      return 'bg-purple-500';
    default:
      return 'bg-gray-500';
  }
};

const formatRelativeTime = (date: Date | string) => {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

/**
 * Build action URL based on notification type and payload.
 * Frontend owns the URL structure, backend only provides data.
 */
const getNotificationActionUrl = (notification: NotificationStruct): string | null => {
  switch (notification.type) {
    case NOTIFICATION_TYPES.budgetAlert: {
      const payload = notification.payload as { budgetId?: number };
      return payload.budgetId ? `/budgets/${payload.budgetId}` : '/budgets';
    }
    case NOTIFICATION_TYPES.changelog:
      return null; // No navigation for changelog
    case NOTIFICATION_TYPES.system:
      return null; // System notifications typically don't navigate
    default:
      return null;
  }
};

const handleNotificationClick = async (notification: NotificationStruct) => {
  if (notification.status === NOTIFICATION_STATUSES.unread) {
    markAsReadMutation.mutate({ id: notification.id });
  }

  const actionUrl = getNotificationActionUrl(notification);
  if (actionUrl) {
    isOpen.value = false;
    window.location.href = actionUrl;
  }
};

const handleMarkAllAsRead = () => {
  markAllAsReadMutation.mutate();
};

const handleDismiss = (id: string) => {
  dismissMutation.mutate({ id });
};
</script>

<template>
  <Popover.Popover v-model:open="isOpen">
    <Popover.PopoverTrigger as-child>
      <Button variant="secondary" size="icon" class="relative">
        <BellIcon class="size-5" />
        <span
          v-if="unreadCount && unreadCount > 0"
          class="bg-primary absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-xs text-white"
        >
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </Button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent class="w-90 p-0" align="end">
      <div class="border-border flex items-center justify-between border-b px-4 py-3">
        <h3 class="text-sm font-semibold">{{ $t('notifications.title') }}</h3>
        <Button
          v-if="unreadCount && unreadCount > 0"
          variant="ghost"
          size="sm"
          class="h-auto px-2 py-1 text-xs"
          :disabled="markAllAsReadMutation.isPending.value"
          @click="handleMarkAllAsRead"
        >
          {{ $t('notifications.markAllAsRead') }}
        </Button>
      </div>

      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Loader2 class="text-muted-foreground size-6 animate-spin" />
      </div>

      <div v-else-if="!notifications?.length" class="py-8 text-center">
        <BellOffIcon class="text-muted-foreground mx-auto mb-2 size-10 opacity-50" />
        <p class="text-muted-foreground text-sm">{{ $t('notifications.empty') }}</p>
      </div>

      <div v-else class="max-h-87.5 overflow-auto">
        <div class="divide-border divide-y">
          <div
            v-for="notification in notifications"
            :key="notification.id"
            :class="[
              'group hover:bg-accent relative cursor-pointer px-4 py-3 transition-colors',
              notification.status === NOTIFICATION_STATUSES.unread && 'bg-accent/50',
            ]"
            @click="handleNotificationClick(notification)"
          >
            <div class="flex items-start gap-3">
              <div
                :class="[
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                  getNotificationIconBg(notification.type),
                ]"
              >
                <component :is="getNotificationIcon(notification.type)" class="size-4 text-white" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <p
                    :class="[
                      'line-clamp-1 text-sm',
                      notification.status === NOTIFICATION_STATUSES.unread ? 'font-semibold' : 'font-medium',
                    ]"
                  >
                    {{ notification.title }}
                  </p>
                  <button
                    class="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    @click.stop="handleDismiss(notification.id)"
                  >
                    <XIcon class="size-4" />
                  </button>
                </div>
                <p v-if="notification.message" class="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                  {{ notification.message }}
                </p>
                <p class="text-muted-foreground mt-1 text-xs">
                  {{ formatRelativeTime(notification.createdAt) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
