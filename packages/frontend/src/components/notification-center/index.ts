import { type Action, toast } from 'vue-sonner';

import { findLiveToast, pulseToast } from './toast-pulse';
import { registerToast, unregisterToast } from './toast-timers';

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
  description?: string;
  type?: NotificationType;
  visibilityTime?: number;
  /** Never auto-hides. Use for actionable errors the user must not miss. */
  persistent?: boolean;
  /** Renders a button inside the toast, e.g. a link to the record that failed. */
  action?: Action;
}

const DEFAULT_VISIBILITY_TIME = 4000;

const TOAST_BY_TYPE = {
  [NotificationType.warning]: toast.warning,
  [NotificationType.error]: toast.error,
  [NotificationType.success]: toast.success,
  [NotificationType.info]: toast.info,
};

/**
 * Sonner keeps a dismissed toast's id bound to the dying card for ~500ms: a raise under that id is
 * swallowed and corrupts the stack's height bookkeeping. So the caller-facing id is only a lookup
 * key, and the id sonner sees is minted fresh for every raise that is not replacing a live toast.
 */
const activeSonnerIds = new Map<NotificationID, NotificationID>();
let sonnerIdCounter = 0;

const releaseActiveId = ({ baseId, sonnerId }: { baseId: NotificationID; sonnerId: NotificationID }) => {
  if (activeSonnerIds.get(baseId) === sonnerId) activeSonnerIds.delete(baseId);
};

export const useNotificationCenter = (): {
  addNotification: (notification: Notification) => NotificationID;
  removeNotification: (id?: NotificationID) => void;
  addSuccessNotification: (message: string) => void;
  addWarningNotification: (message: string) => void;
  addErrorNotification: (message: string) => void;
  addInfoNotification: (message: string) => void;
} => {
  const removeNotification = (id?: NotificationID) => {
    // Any falsy id reaches sonner's dismiss-everything branch and clears the whole stack.
    if (!id) return;

    const sonnerId = activeSonnerIds.get(id) ?? id;

    releaseActiveId({ baseId: id, sonnerId });
    unregisterToast({ id: sonnerId });
    toast.dismiss(sonnerId);
  };

  // Deriving the id from type + text + description keeps identical notifications down to a single
  // visible toast, since a raise under a live toast's id replaces it in place.
  // Sonner's countdown only pauses and resumes, so it gets Infinity and `toast-timers` owns dismissal.
  const addNotification = ({
    id,
    text,
    description,
    type = NotificationType.info,
    visibilityTime,
    persistent,
    action,
  }: Notification): NotificationID => {
    const baseId = id || `${type}:${text}:${description ?? ''}`;
    const activeId = activeSonnerIds.get(baseId);
    const sonnerId = activeId ?? `${baseId}#${sonnerIdCounter++}`;

    // Replacing a live toast leaves the screen unchanged, so the pulse is the only sign it happened.
    // A raise that mints an id lands as a new card with its own entry animation.
    const replacedToastEl = activeId === undefined ? null : findLiveToast({ id: String(baseId) });

    activeSonnerIds.set(baseId, sonnerId);

    TOAST_BY_TYPE[type](text, {
      id: sonnerId,
      testId: String(baseId),
      description,
      action,
      duration: Infinity,
      onDismiss: () => {
        releaseActiveId({ baseId, sonnerId });
        unregisterToast({ id: sonnerId });
      },
    });

    if (replacedToastEl) pulseToast({ element: replacedToastEl });

    if (persistent) unregisterToast({ id: sonnerId });
    else
      registerToast({
        id: sonnerId,
        durationMs: visibilityTime ?? DEFAULT_VISIBILITY_TIME,
        onExpire: () => releaseActiveId({ baseId, sonnerId }),
      });

    return baseId;
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
    addNotification,
    removeNotification,

    addSuccessNotification,
    addWarningNotification,
    addErrorNotification,
    addInfoNotification,
  };
};
