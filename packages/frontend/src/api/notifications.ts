import { api } from '@/api/_api';
import { fromSystemAmount } from '@/api/helpers';
import {
  NOTIFICATION_TYPES,
  NotificationModel,
  NotificationStatus,
  NotificationType,
  TagReminderNotificationPayload,
} from '@bt/shared/types';

interface GetNotificationsParams {
  status?: NotificationStatus;
  type?: NotificationType;
  limit?: number;
  offset?: number;
}

export type NotificationStruct = Omit<NotificationModel, 'userId'>;

/**
 * Converts notification payload amounts from system amount (cents) to display amount.
 */
function convertNotificationFromApi(notification: NotificationStruct): NotificationStruct {
  if (notification.type === NOTIFICATION_TYPES.tagReminder && notification.payload) {
    const payload = notification.payload as TagReminderNotificationPayload;
    return {
      ...notification,
      payload: {
        ...payload,
        actualAmount: payload.actualAmount !== undefined ? fromSystemAmount(payload.actualAmount) : undefined,
        thresholdAmount: payload.thresholdAmount !== undefined ? fromSystemAmount(payload.thresholdAmount) : undefined,
      },
    };
  }
  return notification;
}

export const getNotifications = async (params: GetNotificationsParams = {}): Promise<NotificationStruct[]> => {
  const result: { data: NotificationStruct[] } = await api.get('/notifications', params);
  return result.data.map(convertNotificationFromApi);
};

export const getUnreadCount = async (): Promise<number> => {
  const result = await api.get('/notifications/unread-count');
  return result.count;
};

export const markAsRead = async ({ id }: { id: string }): Promise<boolean> => {
  const result = await api.post(`/notifications/${id}/read`);
  return result.success;
};

export const markAllAsRead = async (): Promise<number> => {
  const result = await api.post('/notifications/read-all');
  return result.updated;
};

export const dismissNotification = async ({ id }: { id: string }): Promise<boolean> => {
  const result = await api.post(`/notifications/${id}/dismiss`);
  return result.success;
};
