import { ApiErrorResponseError } from '@/js/errors';
import { API_ERROR_CODES, SHARE_PERMISSIONS, type SharePermission } from '@bt/shared/types';
import { format } from 'date-fns';
import type { ComposerTranslation } from 'vue-i18n';

/** Subset of `InvitationListItem` (`@/api/share`) the dialog children consume.
 *  Stays in sync structurally — TS will complain at the prop boundary if the
 *  hydrated invitation shape drifts. */
export interface InvitationLike {
  id: string;
  token: string;
  resourceId?: string | number;
  resourceName?: string | null;
  permission: SharePermission;
  expiresAt: string | Date;
  owner: { username: string | null } | null;
}

export const formatExpiry = (value: string | Date) => format(new Date(value), 'yyyy-MM-dd');

export const permissionLabel = (permission: SharePermission, t: ComposerTranslation): string => {
  if (permission === SHARE_PERMISSIONS.read) return t('dialogs.shareInvitationDialog.permissions.read');
  if (permission === SHARE_PERMISSIONS.write) return t('dialogs.shareInvitationDialog.permissions.write');
  return t('dialogs.shareInvitationDialog.permissions.manage');
};

interface ApiErrorPayload {
  code: API_ERROR_CODES | undefined;
  message: string | undefined;
  details: Record<string, unknown> | undefined;
}

/** Unwrap an `ApiErrorResponseError` thrown by the API client. The client throws this
 *  class with `data: { code, message, details }` — the response is NOT axios-wrapped, so
 *  reading `err.response.data.response.code` (a common but wrong axios reflex) silently
 *  gives `undefined`. Routing all error extraction through this helper keeps every
 *  mutation handler consistent. */
export const extractApiError = (err: unknown): ApiErrorPayload => {
  if (err instanceof ApiErrorResponseError) {
    return {
      code: err.data?.code,
      message: err.data?.message,
      details: err.data?.details as Record<string, unknown> | undefined,
    };
  }
  return { code: undefined, message: undefined, details: undefined };
};
