import { api } from '@/api/_api';
import {
  type HouseholdSharePermission,
  type ResourceShareModel,
  ResourceType,
  type ShareInvitationEmailOutcome,
  ShareInvitationModel,
  SharePermission,
  SharePolicy,
  type SharedWithMeAccessSource,
} from '@bt/shared/types';

/** Hydrated invitation row used by the received-list endpoint. */
interface InvitationListItem extends ShareInvitationModel {
  resourceName: string | null;
  owner: { id: number; username: string; avatar: string | null } | null;
  invitee: { id: number; username: string; avatar: string | null } | null;
  /** False when the server has no email provider — pending rows then warn and offer the copy-link remedy. */
  emailConfigured: boolean;
}

interface CreateInvitationPayload {
  inviteeEmail: string;
  resourceType: ResourceType;
  resourceId: string;
  permission: SharePermission;
  policy?: SharePolicy | null;
}

/**
 * The invitation row is always created; `emailOutcome` only reports the email attempt.
 * `'skipped'` means the server has no email provider configured, so the owner has to hand
 * the invite link over manually; `'failed'` means the provider was reached and errored.
 */
type CreateInvitationResponse = ShareInvitationModel & { emailOutcome: ShareInvitationEmailOutcome };

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
  /**
   * `true` only on household accepts where the recipient does not already share their own
   * household back with the inviter. Drives the "share back" prompt; `false` suppresses
   * it (e.g., when both households are already reciprocally shared).
   */
  canBackInvite: boolean;
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

export const resendShareInvitation = (id: string): Promise<CreateInvitationResponse> =>
  api.post(`/share/invitations/${encodeURIComponent(id)}/resend`);

export const cancelShareInvitation = (id: string): Promise<ShareInvitationModel> =>
  api.delete(`/share/invitations/${encodeURIComponent(id)}`);

export const backInviteFromShareInvitation = ({
  sourceInvitationId,
  permission,
  policy,
}: {
  sourceInvitationId: string;
  permission: HouseholdSharePermission;
  policy?: SharePolicy | null;
}): Promise<CreateInvitationResponse> =>
  api.post(`/share/invitations/${encodeURIComponent(sourceInvitationId)}/back-invite`, { permission, policy });

export interface SharedWithMeRow {
  shareId: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string | null;
  permission: SharePermission;
  policy: SharePolicy | null;
  acceptedAt: string;
  owner: { id: number; username: string; avatar: string | null };
  /**
   * `'share'` for per-resource shares, `'household'` for household memberships.
   * `'owner'` never appears — this list is recipient-only. The frontend routes
   * management actions accordingly: household rows link to Settings → Household;
   * per-resource rows open the resource's share dialog.
   */
  accessSource: SharedWithMeAccessSource;
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
