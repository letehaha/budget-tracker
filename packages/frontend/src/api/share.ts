import { api } from '@/api/_api';
import {
  type ResourceShareModel,
  ResourceType,
  ShareInvitationModel,
  SharePermission,
  SharePolicy,
} from '@bt/shared/types';

/** Hydrated invitation row used by the received-list endpoint. */
interface InvitationListItem extends ShareInvitationModel {
  resourceName: string | null;
  owner: { id: number; username: string; avatar: string | null } | null;
  invitee: { id: number; username: string; avatar: string | null } | null;
}

interface CreateInvitationPayload {
  inviteeEmail: string;
  resourceType: ResourceType;
  resourceId: number | string;
  permission: SharePermission;
  policy?: SharePolicy | null;
}

/**
 * `emailDelivered: false` means the row was created but the outbound invitation email
 * could not be sent (Resend down, transient network error). The caller should warn the
 * owner so they don't assume the invitee was reached. `true` covers (a) the email was
 * accepted by Resend, (b) the invitee was unregistered so there was no email to send
 * (these are intentionally silent in Phase 1), or (c) email isn't configured in this
 * environment.
 */
type CreateInvitationResponse = ShareInvitationModel & { emailDelivered: boolean };

export const createShareInvitation = (payload: CreateInvitationPayload): Promise<CreateInvitationResponse> =>
  api.post('/share/invitations', payload);

export const listReceivedShareInvitations = (): Promise<InvitationListItem[]> => api.get('/share/invitations/received');

interface AcceptInvitationResponse {
  invitation: ShareInvitationModel;
  share: {
    id: string;
    ownerUserId: number;
    sharedWithUserId: number;
    resourceType: ResourceType;
    resourceId: string;
    permission: SharePermission;
    policy: SharePolicy | null;
    acceptedAt: string;
  };
}

export const acceptShareInvitation = (token: string): Promise<AcceptInvitationResponse> =>
  api.post(`/share/invitations/${encodeURIComponent(token)}/accept`);

export const declineShareInvitation = (token: string): Promise<{ invitation: ShareInvitationModel }> =>
  api.post(`/share/invitations/${encodeURIComponent(token)}/decline`);

export interface ShareMemberRow {
  user: { id: number; username: string; avatar: string | null };
  role: 'owner' | 'recipient';
  permission: SharePermission;
  policy: SharePolicy | null;
  acceptedAt: string | null;
  shareId: string | null;
}

interface ListMembersResponse {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  members: ShareMemberRow[];
}

export const listShareMembers = ({
  resourceType,
  resourceId,
}: {
  resourceType: ResourceType;
  resourceId: string | number;
}): Promise<ListMembersResponse> =>
  api.get(`/share/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(String(resourceId))}/members`);

export const updateShareMember = ({
  resourceType,
  resourceId,
  userId,
  permission,
  policy,
}: {
  resourceType: ResourceType;
  resourceId: string | number;
  userId: number;
  permission?: SharePermission;
  policy?: SharePolicy | null;
}): Promise<ResourceShareModel> =>
  api.patch(
    `/share/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(String(resourceId))}/members/${userId}`,
    { permission, policy },
  );

export const revokeShareMember = ({
  resourceType,
  resourceId,
  userId,
}: {
  resourceType: ResourceType;
  resourceId: string | number;
  userId: number;
}): Promise<void> =>
  api.delete(
    `/share/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(String(resourceId))}/members/${userId}`,
  );

export const listSentShareInvitations = (): Promise<InvitationListItem[]> => api.get('/share/invitations/sent');

export const resendShareInvitation = (id: string): Promise<ShareInvitationModel & { emailDelivered: boolean }> =>
  api.post(`/share/invitations/${encodeURIComponent(id)}/resend`);

export const cancelShareInvitation = (id: string): Promise<ShareInvitationModel> =>
  api.delete(`/share/invitations/${encodeURIComponent(id)}`);

export interface SharedWithMeRow {
  shareId: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string | null;
  permission: SharePermission;
  policy: SharePolicy | null;
  acceptedAt: string;
  owner: { id: number; username: string; avatar: string | null };
}

export const listSharedWithMe = (): Promise<SharedWithMeRow[]> => api.get('/share/shared-with-me');

export const leaveShare = ({
  resourceType,
  resourceId,
}: {
  resourceType: ResourceType;
  resourceId: string | number;
}): Promise<void> =>
  api.post(`/share/shared-with-me/${encodeURIComponent(resourceType)}/${encodeURIComponent(String(resourceId))}/leave`);
