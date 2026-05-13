import {
  NOTIFICATION_TYPES,
  ResourceType,
  ShareInvitationNotificationPayload,
  ShareLifecycleNotificationPayload,
  SharePermission,
} from '@bt/shared/types';
import Users from '@models/users.model';
import { createNotification } from '@services/notifications';

import { SHARE_SNAPSHOT_MISSING_USER_ID, snapshotShareUser } from './share-user-snapshot';

/**
 * Helpers that wrap `createNotification` for share-related notification types so callers
 * don't need to remember the exact `type` constants and payload shape.
 *
 * Notification payloads use `SHARE_SNAPSHOT_MISSING_USER_ID` (0) as the fallback when the
 * source user row is missing — the frontend renders the embedded `username`/`avatar`
 * snapshot without dereferencing the id, so a `0` lookup never happens. Callers that pass
 * a nullable user (e.g. `notifyInvitationDeclined`) log the missing-row case so it isn't
 * a silent loss.
 */

const snapshotUser = (user: Users | null | undefined) => snapshotShareUser(user, SHARE_SNAPSHOT_MISSING_USER_ID);

interface InvitationContext {
  invitationId: string;
  /** Token is denormalized into the notification payload so the frontend can deep-link
   *  to the accept page without a separate lookup. */
  token: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  permission: SharePermission;
  expiresAt: Date;
}

/**
 * Sent to the invitee when an owner sends them an invitation. The invitee acts on this
 * notification (or the email) to accept/decline.
 */
export const notifyInvitationReceived = async ({
  inviteeUserId,
  owner,
  invitation,
}: {
  inviteeUserId: number;
  owner: Users;
  invitation: InvitationContext;
}) => {
  const payload: ShareInvitationNotificationPayload = {
    invitationId: invitation.invitationId,
    token: invitation.token,
    resourceType: invitation.resourceType,
    resourceId: invitation.resourceId,
    resourceName: invitation.resourceName,
    permission: invitation.permission,
    owner: snapshotUser(owner),
    expiresAt: invitation.expiresAt.toISOString(),
  };

  return createNotification({
    userId: inviteeUserId,
    type: NOTIFICATION_TYPES.shareInvitationReceived,
    title: `${owner.username} shared "${invitation.resourceName}" with you`,
    message: `Open to accept or decline the invitation. Expires ${invitation.expiresAt.toISOString().slice(0, 10)}.`,
    payload,
    expiresAt: invitation.expiresAt,
  });
};

/**
 * Sent to the owner when a recipient accepts a previously-sent invitation.
 */
export const notifyInvitationAccepted = async ({
  ownerUserId,
  recipient,
  shareId,
  invitationId,
  resource,
  permission,
}: {
  ownerUserId: number;
  recipient: Users;
  shareId: string;
  invitationId: string;
  resource: { type: ResourceType; id: string; name: string };
  permission: SharePermission;
}) => {
  const payload: ShareLifecycleNotificationPayload = {
    shareId,
    invitationId,
    resourceType: resource.type,
    resourceId: resource.id,
    resourceName: resource.name,
    permission,
    counterpartUser: snapshotUser(recipient),
  };

  return createNotification({
    userId: ownerUserId,
    type: NOTIFICATION_TYPES.shareAccepted,
    title: `${recipient.username} accepted your share for "${resource.name}"`,
    payload,
  });
};

/**
 * Sent to the owner when a recipient declines a previously-sent invitation.
 */
export const notifyInvitationDeclined = async ({
  ownerUserId,
  recipient,
  invitationId,
  resource,
}: {
  ownerUserId: number;
  recipient: Users | null;
  invitationId: string;
  resource: { type: ResourceType; id: string; name: string };
}) => {
  const payload: ShareLifecycleNotificationPayload = {
    invitationId,
    resourceType: resource.type,
    resourceId: resource.id,
    resourceName: resource.name,
    counterpartUser: snapshotUser(recipient),
  };

  return createNotification({
    userId: ownerUserId,
    type: NOTIFICATION_TYPES.shareDeclined,
    title: `${snapshotUser(recipient).username} declined your share for "${resource.name}"`,
    payload,
  });
};

/**
 * Sent to the owner when a pending invitation is swept up by the daily expiration cron.
 * The recipient never gets a separate notification — the invitation card simply disappears
 * from their inbox once they refetch.
 */
export const notifyInvitationExpired = async ({
  ownerUserId,
  invitee,
  invitationId,
  resource,
  permission,
}: {
  ownerUserId: number;
  invitee: Users | null;
  invitationId: string;
  resource: { type: ResourceType; id: string; name: string };
  permission: SharePermission;
}) => {
  const payload: ShareLifecycleNotificationPayload = {
    invitationId,
    resourceType: resource.type,
    resourceId: resource.id,
    resourceName: resource.name,
    permission,
    counterpartUser: snapshotUser(invitee),
  };

  return createNotification({
    userId: ownerUserId,
    type: NOTIFICATION_TYPES.shareExpired,
    title: `Your invitation to "${resource.name}" expired`,
    payload,
  });
};

/**
 * Sent to a recipient when an owner (or a `manage` co-recipient) revokes their share.
 * Stamps the resource snapshot at the moment of revocation so the recipient still sees a
 * meaningful entry even if the underlying resource is later deleted.
 */
export const notifyShareRevoked = async ({
  recipientUserId,
  owner,
  shareId,
  resource,
  permission,
}: {
  recipientUserId: number;
  owner: Users | null;
  shareId: string;
  resource: { type: ResourceType; id: string; name: string };
  permission: SharePermission;
}) => {
  const payload: ShareLifecycleNotificationPayload = {
    shareId,
    resourceType: resource.type,
    resourceId: resource.id,
    resourceName: resource.name,
    permission,
    counterpartUser: snapshotUser(owner),
  };

  return createNotification({
    userId: recipientUserId,
    type: NOTIFICATION_TYPES.shareRevoked,
    title: `Your access to "${resource.name}" was revoked`,
    payload,
  });
};

/**
 * Sent to a recipient when an owner deletes the underlying resource (e.g. the shared
 * account). Distinct from `notifyShareRevoked` because the resource itself is gone — there
 * is nothing to be re-shared and any deep-link to the resource will 404. Stamps the
 * resource snapshot at the moment of deletion so the recipient still sees a meaningful
 * entry after the row vanishes.
 */
export const notifyShareOwnerAccountDeleted = async ({
  recipientUserId,
  owner,
  shareId,
  resource,
  permission,
}: {
  recipientUserId: number;
  owner: Users | null;
  shareId: string;
  resource: { type: ResourceType; id: string; name: string };
  permission: SharePermission;
}) => {
  const payload: ShareLifecycleNotificationPayload = {
    shareId,
    resourceType: resource.type,
    resourceId: resource.id,
    resourceName: resource.name,
    permission,
    counterpartUser: snapshotUser(owner),
  };

  return createNotification({
    userId: recipientUserId,
    type: NOTIFICATION_TYPES.shareOwnerAccountDeleted,
    title: `The shared account "${resource.name}" was deleted`,
    payload,
  });
};

/**
 * Sent to the owner when a recipient voluntarily leaves a share. Symmetric counterpart of
 * `notifyShareRevoked` — used by the recipient-initiated "leave" flow.
 */
export const notifyShareLeft = async ({
  ownerUserId,
  recipient,
  shareId,
  resource,
  permission,
}: {
  ownerUserId: number;
  recipient: Users | null;
  shareId: string;
  resource: { type: ResourceType; id: string; name: string };
  permission: SharePermission;
}) => {
  const payload: ShareLifecycleNotificationPayload = {
    shareId,
    resourceType: resource.type,
    resourceId: resource.id,
    resourceName: resource.name,
    permission,
    counterpartUser: snapshotUser(recipient),
  };

  return createNotification({
    userId: ownerUserId,
    type: NOTIFICATION_TYPES.shareLeft,
    title: `${snapshotUser(recipient).username} left "${resource.name}"`,
    payload,
  });
};
