import { Ref, ref } from 'vue';

export enum NotificationType {
  warning,
  error,
  success,
  info,
}

type NotificationID = number | string;
interface Notification {
  id?: NotificationID;
  text: string;
  type?: NotificationType;
  visibilityTime?: number;
  /**
   * Persistent notifications never auto-hide — they stay until the user
   * dismisses them via the close button. Use for actionable errors the user
   * must not miss (e.g. "connect currency X"), not for routine toasts.
   */
  persistent?: boolean;
}

let idCounter = 0;
const notifications: Ref<Notification[]> = ref([]);
const notificationIds: Record<NotificationID, unknown> = {};

export const useNotificationCenter = (): {
  notifications: Ref<Notification[]>;
  addNotification: (notification: Notification) => NotificationID | void;
  removeNotification: (id?: NotificationID) => void;
  addSuccessNotification: (message: string) => void;
  addWarningNotification: (message: string) => void;
  addErrorNotification: (message: string) => void;
  addInfoNotification: (message: string) => void;
} => {
  const removeNotification = (id?: NotificationID) => {
    notifications.value = notifications.value.filter((item) => item.id !== id);
    // Free the id on every removal path (auto-hide AND manual dismiss) so a
    // fixed-id notification can be raised again later.
    if (id !== undefined) delete notificationIds[id];
  };

  const addNotification = (notification: Notification): NotificationID | void => {
    const id = notification.id ?? idCounter++;

    if (notificationIds[id]) {
      return undefined;
    }

    notificationIds[id] = id;

    notifications.value.push({
      type: NotificationType.info,
      ...notification,
      id,
    });

    if (!notification.persistent) {
      setTimeout(() => {
        removeNotification(id);
      }, notification.visibilityTime ?? 4000);
    }

    return id;
  };

  const addSuccessNotification = (message: string) => {
    addNotification({
      text: message,
      type: NotificationType.success,
    });
  };

  const addWarningNotification = (message: string) => {
    addNotification({
      text: message,
      type: NotificationType.warning,
    });
  };

  const addErrorNotification = (message: string) => {
    addNotification({
      text: message,
      type: NotificationType.error,
    });
  };

  const addInfoNotification = (message: string) => {
    addNotification({
      text: message,
      type: NotificationType.info,
    });
  };

  return {
    notifications,
    addNotification,
    removeNotification,

    addSuccessNotification,
    addWarningNotification,
    addErrorNotification,
    addInfoNotification,
  };
};
