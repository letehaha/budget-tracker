import {
  RESOURCE_TYPES,
  ResourceType,
  SHARE_INVITATION_STATUSES,
  SHARE_PERMISSIONS,
  SHARING_LIMITS,
  ShareInvitationModel,
  SharePermission,
  SharePolicy,
  TRANSACTIONS_WRITE_SCOPES,
} from '@bt/shared/types';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { findUserByEmail } from './find-user-by-email.service';
import { generateInvitationToken } from './generate-invitation-token';
import { getMaxPendingInvitationsPerResource } from './limits';
import { sendInvitationEmail } from './share-invitation-email';
import { notifyInvitationReceived } from './share-notifications';

interface CreateInvitationParams {
  ownerUserId: number;
  inviteeEmail: string;
  resourceType: ResourceType;
  resourceId: number | string;
  permission: SharePermission;
  policy?: SharePolicy | null;
}

interface CreateInvitationResult {
  invitation: ShareInvitationModel;
}

interface ResolvedResource {
  ownerUserId: number;
  ownerCurrencyCode: string;
  resourceName: string;
}

const resolveOwnedResource = async ({
  ownerUserId,
  resourceType,
  resourceId,
}: {
  ownerUserId: number;
  resourceType: ResourceType;
  resourceId: string;
}): Promise<ResolvedResource> => {
  if (resourceType === RESOURCE_TYPES.account) {
    const numericId = Number(resourceId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new NotFoundError({ message: 'Account not found' });
    }
    const account = await Accounts.findOne({ where: { id: numericId } });
    if (!account) {
      throw new NotFoundError({ message: 'Account not found' });
    }
    if (account.userId !== ownerUserId) {
      // Don't leak existence — anyone other than the owner sees a 404.
      throw new NotFoundError({ message: 'Account not found' });
    }
    return {
      ownerUserId: account.userId,
      ownerCurrencyCode: account.currencyCode,
      resourceName: account.name,
    };
  }
  // Defensive — controller-level zod validation already restricts resourceType.
  throw new ValidationError({ message: `Unsupported resource type: ${resourceType}` });
};

const buildCleanPolicy = ({
  permission,
  policy,
}: {
  permission: SharePermission;
  policy: SharePolicy | null | undefined;
}): SharePolicy | null => {
  if (permission === SHARE_PERMISSIONS.read) {
    return null;
  }
  const scope = policy?.transactionsWriteScope ?? TRANSACTIONS_WRITE_SCOPES.all;
  return { transactionsWriteScope: scope };
};

interface CreateInvitationImplResult extends CreateInvitationResult {
  /** Hydrated invitee row when the email resolved to an existing user — used by the
   *  post-commit side-effect step to send the email and in-app notification. `null` for
   *  unresolved emails (Phase 1 keeps those silent; see PRD D6 / F17). */
  resolvedInvitee: { userId: number; email: string } | null;
  resourceName: string;
}

const createInvitationImpl = async (params: CreateInvitationParams): Promise<CreateInvitationImplResult> => {
  const { ownerUserId, inviteeEmail, resourceType, resourceId, permission } = params;
  const resourceIdStr = String(resourceId);
  const normalizedEmail = inviteeEmail.trim().toLowerCase();

  // Owner-side validation only (per D6). Anything that would distinguish "registered" from
  // "unregistered" emails is moved to the accept endpoint to avoid user enumeration.
  const resource = await resolveOwnedResource({ ownerUserId, resourceType, resourceId: resourceIdStr });

  // Recipient cap counts accepted shares only — not pending, and not affected by
  // unresolved invitations. Owner-side check, no leak.
  const acceptedShareCount = await ResourceShares.count({
    where: {
      resourceType,
      resourceId: resourceIdStr,
      acceptedAt: { [Op.not]: null },
    },
  });
  if (acceptedShareCount >= SHARING_LIMITS.maxRecipientsPerResource) {
    throw new ConflictError({
      message: `This resource has reached the maximum of ${SHARING_LIMITS.maxRecipientsPerResource} recipient(s).`,
    });
  }

  // Cap on the number of pending invitations per (owner, resource). Test env uses a
  // smaller cap (see SHARING_LIMITS) so the boundary stays cheap to exercise. Dev/prod
  // share the same higher cap. Per-recipient rate-limiting in S6 is the real spam guard;
  // this just keeps a single owner from creating thousands of pending rows for one
  // resource (DB hygiene + UI sanity).
  const pendingCap = getMaxPendingInvitationsPerResource();
  const pendingCount = await ShareInvitations.count({
    where: {
      ownerUserId,
      resourceType,
      resourceId: resourceIdStr,
      status: SHARE_INVITATION_STATUSES.pending,
    },
  });
  if (pendingCount >= pendingCap) {
    throw new ConflictError({
      message: `You have reached the maximum of ${pendingCap} pending invitations for this resource. Wait for some to expire or be acted on before sending more.`,
    });
  }

  // Resolve invitee best-effort. Used for (a) self-share guard (no leak — owner knows
  // their own email), (b) deciding whether to stamp inviteeUserId + send notifications.
  // A null result is fine: row is still created with inviteeUserId=null (D6).
  const invitee = await findUserByEmail({ email: normalizedEmail });
  if (invitee && invitee.appUser.id === ownerUserId) {
    throw new ValidationError({ message: 'You cannot share a resource with yourself.' });
  }

  const policy = buildCleanPolicy({ permission, policy: params.policy });
  const expiresAt = new Date(Date.now() + SHARING_LIMITS.invitationExpirationDays * 24 * 60 * 60 * 1000);
  const token = generateInvitationToken();

  const invitation = await ShareInvitations.create({
    ownerUserId,
    // Always store the lowercased form so case-insensitive lookups against the caller's
    // auth email are simple `Op.eq` comparisons (no `LOWER(...)` SQL fn needed).
    inviteeEmail: normalizedEmail,
    inviteeUserId: invitee?.appUser.id ?? null,
    resourceType,
    resourceId: resourceIdStr,
    permission,
    policy,
    token,
    status: SHARE_INVITATION_STATUSES.pending,
    expiresAt,
  });

  // In-app notification only when invitee is a known user — Phase 1 has no notification
  // surface for unregistered emails (see F17; Phase 5 adds an outbound signup-invite email).
  if (invitee) {
    const owner = await Users.findByPk(ownerUserId);
    if (owner) {
      await notifyInvitationReceived({
        inviteeUserId: invitee.appUser.id,
        owner,
        invitation: {
          invitationId: invitation.id,
          token: invitation.token,
          resourceType,
          resourceId: resourceIdStr,
          resourceName: resource.resourceName,
          permission,
          expiresAt,
        },
      });
    }
  }

  return {
    invitation: invitation.toJSON() as ShareInvitationModel,
    resolvedInvitee: invitee ? { userId: invitee.appUser.id, email: invitee.email } : null,
    resourceName: resource.resourceName,
  };
};

/**
 * Sends a share invitation. Owner-side validation runs synchronously inside the
 * transaction. Invitee-side validation (existence, currency, duplicate share) is
 * intentionally deferred to the accept endpoint per D6 (user-enumeration mitigation).
 *
 * The two side effects are split deliberately: the in-app notification is a durable record
 * we want consistent with the DB row (in-transaction), while the email is "best effort"
 * and runs after commit so transient mail-provider failures don't roll back the invitation.
 */
export const createInvitation = async (params: CreateInvitationParams): Promise<CreateInvitationResult> => {
  const result = await withTransaction(createInvitationImpl)(params);

  // Email send is skipped for unresolved invitees — Phase 1 has no outbound path for them
  // (Phase 5 will add the "sign up to accept" email; see PRD F17).
  if (result.resolvedInvitee) {
    const owner = await Users.findByPk(params.ownerUserId);
    const ownerDisplayName = owner?.username ?? 'A MoneyMatter user';
    await sendInvitationEmail({
      toEmail: result.resolvedInvitee.email,
      ownerDisplayName,
      resourceType: result.invitation.resourceType,
      resourceName: result.resourceName,
      permission: result.invitation.permission,
      policy: result.invitation.policy,
      token: result.invitation.token,
      expiresAt: new Date(result.invitation.expiresAt),
    });
  }

  return { invitation: result.invitation };
};
