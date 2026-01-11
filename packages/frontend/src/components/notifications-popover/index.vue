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
import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from '@bt/shared/types';
import { BellIcon, BellOffIcon, Loader2 } from 'lucide-vue-next';
import { ref } from 'vue';

import NotificationItem from './notification-item.vue';

const isOpen = ref(false);

const { data: notifications, isLoading } = useNotifications();
const { data: unreadCount } = useUnreadNotificationsCount();

const markAsReadMutation = useMarkNotificationAsRead();
const markAllAsReadMutation = useMarkAllNotificationsAsRead();
const dismissMutation = useDismissNotification();

/**
 * Build action URL based on notification type and payload.
 * Frontend owns the URL structure, backend only provides data.
 */
const getActionUrl = (notification: NotificationStruct): string | null => {
  switch (notification.type) {
    case NOTIFICATION_TYPES.budgetAlert: {
      const payload = notification.payload as { budgetId?: number };
      return payload.budgetId ? `/budgets/${payload.budgetId}` : '/budgets';
    }
    case NOTIFICATION_TYPES.changelog:
    case NOTIFICATION_TYPES.system:
    default:
      return null;
  }
};

const handleNotificationClick = (notification: NotificationStruct) => {
  if (notification.status === NOTIFICATION_STATUSES.unread) {
    markAsReadMutation.mutate({ id: notification.id });
  }

  const actionUrl = getActionUrl(notification);
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
          <NotificationItem
            v-for="notification in notifications"
            :key="notification.id"
            :notification="notification"
            @click="handleNotificationClick"
            @dismiss="handleDismiss"
          />
        </div>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>
