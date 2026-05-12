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

/**
 * `emailDelivered: false` means the row was created but the outbound invitation email
 * could not be sent (Resend down, transient network error). The caller should warn the
 * owner so they don't assume the invitee was reached. `true` covers (a) the email was
 * accepted by Resend, (b) the invitee was unregistered so there was no email to send
 * (Phase 1 leaves these silent — see PRD F17), or (c) email isn't configured in this
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
