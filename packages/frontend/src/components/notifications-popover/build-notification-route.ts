import type { NotificationStruct } from '@/api/notifications';
import { ROUTES_NAMES } from '@/routes/constants';
import {
  NOTIFICATION_TYPES,
  RESOURCE_TYPES,
  type ShareInvitationNotificationPayload,
  type ShareInvitationSendFailedPayload,
  type ShareLifecycleNotificationPayload,
} from '@bt/shared/types';

/**
 * Outcome of resolving a notification click.
 *
 * `spa` keeps the user inside the app — used for in-app deep-links so globally-mounted
 * dialogs (e.g. accept/decline) can pick up the query param without a full reload.
 * `external` falls back to a full navigation for targets that live outside the SPA router.
 * `null` means "not actionable" — changelog/system entries display content but don't deep-link.
 */
type NotificationRoute =
  | {
      kind: 'spa';
      to: {
        name: string;
        params?: Record<string, string | number>;
        query?: Record<string, string>;
      };
    }
  | { kind: 'external'; href: string }
  | null;

export const buildNotificationRoute = (notification: NotificationStruct): NotificationRoute => {
  switch (notification.type) {
    case NOTIFICATION_TYPES.shareInvitationReceived: {
      const payload = notification.payload as ShareInvitationNotificationPayload | undefined;
      if (!payload?.token) return null;
      return {
        kind: 'spa',
        to: { name: ROUTES_NAMES.accounts, query: { invitation_token: payload.token } },
      };
    }

    case NOTIFICATION_TYPES.shareAccepted: {
      const payload = notification.payload as ShareLifecycleNotificationPayload | undefined;
      if (payload?.resourceType !== RESOURCE_TYPES.account) return null;
      const accountId = Number(payload.resourceId);
      if (!Number.isInteger(accountId)) return null;
      return {
        kind: 'spa',
        to: { name: ROUTES_NAMES.account, params: { id: accountId } },
      };
    }

    case NOTIFICATION_TYPES.shareInvitationSendFailed: {
      // Drop the owner on the resource so they can hit "Resend" on the pending row in the
      // sharing panel without having to navigate. Currently only accounts are shareable;
      // when more resource types ship, branch the route per `resourceType`.
      const payload = notification.payload as ShareInvitationSendFailedPayload | undefined;
      if (payload?.resourceType !== RESOURCE_TYPES.account) return null;
      const accountId = Number(payload.resourceId);
      if (!Number.isInteger(accountId)) return null;
      return {
        kind: 'spa',
        to: { name: ROUTES_NAMES.account, params: { id: accountId } },
      };
    }

    case NOTIFICATION_TYPES.budgetAlert: {
      const payload = notification.payload as { budgetId?: number } | undefined;
      if (payload?.budgetId) {
        return {
          kind: 'spa',
          to: { name: ROUTES_NAMES.plannedBudgetDetails, params: { id: payload.budgetId } },
        };
      }
      return {
        kind: 'spa',
        to: { name: ROUTES_NAMES.plannedBudgets },
      };
    }

    default:
      return null;
  }
};
