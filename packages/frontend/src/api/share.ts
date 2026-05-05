import { api } from '@/api/_api';
import { ResourceType, ShareInvitationModel, SharePermission, SharePolicy } from '@bt/shared/types';

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

export const createShareInvitation = (payload: CreateInvitationPayload): Promise<ShareInvitationModel> =>
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
