import {
  NOTIFICATION_TYPES,
  ResourceType,
  ShareInvitationNotificationPayload,
  ShareLifecycleNotificationPayload,
  SharePermission,
} from '@bt/shared/types';
import Users from '@models/users.model';
import { createNotification } from '@services/notifications';

/**
 * Helpers that wrap `createNotification` for share-related notification types so callers
 * don't need to remember the exact `type` constants and payload shape.
 */

interface ShareUserSnapshot {
  /**
   * Real Users.id, or `0` when the source row no longer exists (e.g. the recipient
   * deleted their account between accepting and declining). The `0` sentinel is the
   * "user gone" marker for share-notification payloads only — frontend renders it as
   * the snapshot username/avatar without dereferencing the id, so a `0` lookup never
   * happens. Callers that pass a nullable user (notifyInvitationDeclined) log the
   * missing-row case at the call site so it isn't a silent loss.
   */
  id: number;
  username: string;
  avatar: string | null;
}

const SHARE_SNAPSHOT_MISSING_USER_ID = 0;

const snapshotUser = (user: Users | null | undefined): ShareUserSnapshot => ({
  id: user?.id ?? SHARE_SNAPSHOT_MISSING_USER_ID,
  username: user?.username ?? 'Unknown user',
  avatar: user?.avatar ?? null,
});

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
