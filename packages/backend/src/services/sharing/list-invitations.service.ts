import { SHARE_INVITATION_STATUSES, ShareInvitationModel } from '@bt/shared/types';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { Op, WhereOptions } from 'sequelize';

import { resolveResourceName } from './can-user-access-resource.service';
import { getEmailForUser } from './find-user-by-email.service';

/**
 * Same shape as `ShareInvitationModel` plus a denormalized `resourceName` and `owner` /
 * `invitee` blocks so the frontend can render the list without N+1 lookups.
 */
interface InvitationListItem extends ShareInvitationModel {
  resourceName: string | null;
  owner: { id: number; username: string; avatar: string | null } | null;
  invitee: { id: number; username: string; avatar: string | null } | null;
}

const userSnapshot = (user: Users | null | undefined) =>
  user ? { id: user.id, username: user.username, avatar: user.avatar ?? null } : null;

const hydrate = async (rows: ShareInvitations[]): Promise<InvitationListItem[]> => {
  const userIds = new Set<number>();
  rows.forEach((row) => {
    userIds.add(row.ownerUserId);
    if (row.inviteeUserId !== null) userIds.add(row.inviteeUserId);
  });
  const users = userIds.size ? await Users.findAll({ where: { id: { [Op.in]: Array.from(userIds) } } }) : [];
  const usersById = new Map(users.map((u) => [u.id, u]));

  const nameCache = new Map<string, string | null>();
  const items: InvitationListItem[] = [];
  for (const row of rows) {
    const cacheKey = `${row.resourceType}:${row.resourceId}`;
    if (!nameCache.has(cacheKey)) {
      nameCache.set(
        cacheKey,
        await resolveResourceName({ resourceType: row.resourceType, resourceId: row.resourceId }),
      );
    }
    items.push({
      ...(row.toJSON() as ShareInvitationModel),
      resourceName: nameCache.get(cacheKey) ?? null,
      owner: userSnapshot(usersById.get(row.ownerUserId)),
      invitee: row.inviteeUserId !== null ? userSnapshot(usersById.get(row.inviteeUserId)) : null,
    });
  }
  return items;
};

/**
 * List invitations the caller has sent. Defaults to all statuses, ordered newest first,
 * so the owner can see history (resent / expired / revoked) alongside live ones.
 */
export const listSentInvitations = async ({ ownerUserId }: { ownerUserId: number }): Promise<InvitationListItem[]> => {
  const rows = await ShareInvitations.findAll({
    where: { ownerUserId },
    order: [['createdAt', 'DESC']],
  });
  return hydrate(rows);
};

/**
 * List pending invitations the caller can act on. Includes:
 *   - Rows where `inviteeUserId === caller.id` (sent after they signed up).
 *   - Rows where `inviteeUserId IS NULL` AND `lower(inviteeEmail) === lower(caller.email)`
 *     (sent before signup; the binding will happen on accept/decline). This is what makes
 *     the "sign up via invite link → see invite" flow work end-to-end without any
 *     dedicated linking job.
 */
export const listReceivedInvitations = async ({
  inviteeUserId,
}: {
  inviteeUserId: number;
}): Promise<InvitationListItem[]> => {
  const callerEmail = await getEmailForUser({ userId: inviteeUserId });
  const recipientPredicates: WhereOptions[] = [{ inviteeUserId }];
  if (callerEmail) {
    recipientPredicates.push({
      inviteeUserId: null,
      // `inviteeEmail` is stored already-lowercased on create, so an exact match against the
      // lowercased caller email is sufficient.
      inviteeEmail: callerEmail.toLowerCase(),
    });
  }
  const rows = await ShareInvitations.findAll({
    where: {
      [Op.or]: recipientPredicates,
      status: SHARE_INVITATION_STATUSES.pending,
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [['createdAt', 'DESC']],
  });
  return hydrate(rows);
};
