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
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Budgets from '@models/budget.model';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import { getBaseCurrency } from '@models/users-currencies.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { findUserByEmail } from '../find-user-by-email.service';
import { getMaxPendingInvitationsPerResource } from '../limits';
import { LIFECYCLE_NOTIFIERS } from '../share-notifications';
import { FALLBACK_OWNER_DISPLAY_NAME } from '../share-user-snapshot';
import { formatHouseholdLabel, toPositiveInt } from '../sharing-utils';
import { generateInvitationToken } from './generate-invitation-token';
import { sendInvitationEmail } from './share-invitation-email';

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
  /**
   * `false` when the post-commit email send failed (Resend down, network error, etc.) so
   * the caller can surface a "we created the invitation but couldn't send the email"
   * hint. `true` when the invitee is unregistered (no email to send), the invitee was
   * resolved and Resend accepted the message, or Resend isn't configured (dev/test).
   */
  emailDelivered: boolean;
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
    const account = await Accounts.findOne({ where: { id: resourceId } });
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
  if (resourceType === RESOURCE_TYPES.budget) {
    const budget = await Budgets.findOne({ where: { id: resourceId } });
    if (!budget) {
      throw new NotFoundError({ message: 'Budget not found' });
    }
    if (budget.userId !== ownerUserId) {
      // Don't leak existence — anyone other than the owner sees a 404.
      throw new NotFoundError({ message: 'Budget not found' });
    }
    // Budgets are denominated in the owner's base currency (limitAmount + spending
    // stats), not a per-budget currency. Recipient base currency is locked against
    // this at accept-time.
    const ownerBaseCurrency = await getBaseCurrency({ userId: ownerUserId });
    if (!ownerBaseCurrency) {
      throw new ValidationError({ message: 'Set your base currency before sharing a budget.' });
    }
    return {
      ownerUserId: budget.userId,
      ownerCurrencyCode: ownerBaseCurrency.currencyCode,
      resourceName: budget.name,
    };
  }
  if (resourceType === RESOURCE_TYPES.household) {
    // A household is identified by its owner — the inviter can only invite people to
    // their own household, so `resourceId` must match `ownerUserId` exactly. Anything
    // else is a client bug or a cross-household attempt.
    const numericResourceId = toPositiveInt(resourceId);
    if (numericResourceId === null || numericResourceId !== ownerUserId) {
      throw new ValidationError({ message: 'A household invitation must target your own household.' });
    }
    const ownerUser = await Users.findByPk(ownerUserId);
    if (!ownerUser) {
      // Authenticated owner with no Users row — DB integrity violation. Log so it
      // surfaces, then surface a 404 (don't leak the integrity issue to the caller).
      logger.error(
        {
          message: 'Owner Users row missing when resolving household resource',
          error: new Error(`Users.findByPk returned null for ownerUserId=${ownerUserId}`),
        },
        { code: 'SHARE_OWNER_USER_MISSING_FOR_RESOURCE_RESOLVE', ownerUserId },
      );
      throw new NotFoundError({ message: 'Owner not found' });
    }
    const ownerBaseCurrency = await getBaseCurrency({ userId: ownerUserId });
    if (!ownerBaseCurrency) {
      throw new ValidationError({ message: 'Set your base currency before inviting people to your household.' });
    }
    return {
      ownerUserId,
      ownerCurrencyCode: ownerBaseCurrency.currencyCode,
      resourceName: formatHouseholdLabel(ownerUser.username),
    };
  }
  // Defensive — controller-level zod validation already restricts resourceType.
  throw new ValidationError({ message: `Unsupported resource type: ${resourceType}` });
};

const buildCleanPolicy = ({
  permission,
  policy,
  resourceType,
}: {
  permission: SharePermission;
  policy: SharePolicy | null | undefined;
  resourceType: ResourceType;
}): SharePolicy | null => {
  if (permission === SHARE_PERMISSIONS.read) {
    return null;
  }
  // Budgets have no per-tx policy in MVP — `write` here means "attach own transactions",
  // nothing else. Storing a `transactionsWriteScope` here would leak meaningless data into
  // the row that a future reader could mistake for a real policy. Return null.
  if (resourceType === RESOURCE_TYPES.budget) {
    return null;
  }
  const scope = policy?.transactionsWriteScope ?? TRANSACTIONS_WRITE_SCOPES.all;
  return { transactionsWriteScope: scope };
};

interface CreateInvitationImplResult {
  invitation: ShareInvitationModel;
  /** Hydrated invitee row when the email resolved to an existing user — used by the
   *  post-commit side-effect step to send the email and in-app notification. `null` for
   *  unresolved emails (kept silent to avoid leaking which addresses are registered). */
  resolvedInvitee: { userId: number; email: string } | null;
  resourceName: string;
}

const createInvitationImpl = async (params: CreateInvitationParams): Promise<CreateInvitationImplResult> => {
  const { ownerUserId, inviteeEmail, resourceType, resourceId, permission } = params;
  const resourceIdStr = String(resourceId);
  const normalizedEmail = inviteeEmail.trim().toLowerCase();

  // Household memberships never grant `manage` — DB CHECK constraints enforce this, but
  // surface a friendly error before the constraint trips.
  if (resourceType === RESOURCE_TYPES.household && permission === SHARE_PERMISSIONS.manage) {
    throw new ValidationError({ message: 'Household members cannot receive manage permission.' });
  }

  // Owner-side validation only. Anything that would distinguish "registered" from
  // "unregistered" emails is moved to the accept endpoint to avoid user enumeration.
  const resource = await resolveOwnedResource({ ownerUserId, resourceType, resourceId: resourceIdStr });

  // Recipient cap counts accepted shares only — not pending, and not affected by
  // unresolved invitations. Owner-side check, no leak. Household has its own cap because
  // a household grant carries broader reach (every account the owner has) than a single
  // per-resource share.
  const acceptedShareCount = await ResourceShares.count({
    where: {
      resourceType,
      resourceId: resourceIdStr,
      acceptedAt: { [Op.not]: null },
    },
  });
  const acceptedCap =
    resourceType === RESOURCE_TYPES.household
      ? SHARING_LIMITS.maxHouseholdMembers
      : SHARING_LIMITS.maxRecipientsPerResource;
  if (acceptedShareCount >= acceptedCap) {
    const target = resourceType === RESOURCE_TYPES.household ? 'household member(s)' : 'recipient(s)';
    throw new ConflictError({
      message: `This resource has reached the maximum of ${acceptedCap} ${target}.`,
    });
  }

  // Cap on the number of pending invitations per (owner, resource). Test env uses a
  // smaller cap (see SHARING_LIMITS) so the boundary stays cheap to exercise. Dev/prod
  // share the same higher cap. Per-recipient rate-limiting is the real spam guard; this
  // just keeps a single owner from creating thousands of pending rows for one resource
  // (DB hygiene + UI sanity).
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
  // A null result is fine: row is still created with inviteeUserId=null, and the
  // unresolved-email path stays silent to avoid leaking which addresses are registered.
  const invitee = await findUserByEmail({ email: normalizedEmail });
  if (invitee && invitee.appUser.id === ownerUserId) {
    throw new ValidationError({ message: 'You cannot share a resource with yourself.' });
  }

  const policy = buildCleanPolicy({ permission, policy: params.policy, resourceType });
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

  // In-app notification only when invitee is a known user — unregistered emails get
  // no in-app surface (they'll be reached out-of-band once the signup-invite email path
  // exists).
  if (invitee) {
    const owner = await Users.findByPk(ownerUserId);
    if (owner) {
      const notify = LIFECYCLE_NOTIFIERS.invitationReceived[resourceType];
      await notify({
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
    } else {
      // Owner row missing for an authenticated owner — data-integrity issue. Skip the
      // in-app notification but report so it surfaces instead of disappearing. Stable
      // `code` for Sentry/dashboard grouping (logger.error auto-captures to Sentry).
      logger.error(
        {
          message: 'Owner not found when emitting invitation-received notification',
          error: new Error(`Users.findByPk returned null for ownerUserId=${ownerUserId}`),
        },
        {
          code: 'SHARE_OWNER_USER_MISSING_FOR_NOTIFICATION',
          ownerUserId,
          invitationId: invitation.id,
          inviteeUserId: invitee.appUser.id,
        },
      );
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
 * intentionally deferred to the accept endpoint to avoid leaking which emails belong
 * to registered users (user-enumeration mitigation).
 *
 * The two side effects are split deliberately: the in-app notification is a durable record
 * we want consistent with the DB row (in-transaction), while the email is "best effort"
 * and runs after commit so transient mail-provider failures don't roll back the invitation.
 */
export const createInvitation = async (params: CreateInvitationParams): Promise<CreateInvitationResult> => {
  const result = await withTransaction(createInvitationImpl)(params);

  // Email send is skipped for unresolved invitees — there's no outbound path for them
  // yet (a future "sign up to accept" email will cover that). No invitee, no email
  // failure mode for the caller to worry about.
  if (!result.resolvedInvitee) {
    return { invitation: result.invitation, emailDelivered: true };
  }

  // Post-commit side effects. Wrap so a transient Users lookup or notify failure can't
  // reject the API call — the invitation row is already committed and the email-send
  // outcome already has its own internal error handling. Anything that escapes here
  // would otherwise present as a 500 to the caller despite a successfully created row.
  try {
    const owner = await Users.findByPk(params.ownerUserId);
    if (!owner) {
      // Owner row missing for an authenticated owner — data-integrity issue. Continue with
      // a generic display name so the email still goes out, but report for investigation.
      // Stable `code` for Sentry/dashboard grouping (logger.error auto-captures to Sentry).
      logger.error(
        {
          message: 'Owner not found when sending invitation email',
          error: new Error(`Users.findByPk returned null for ownerUserId=${params.ownerUserId}`),
        },
        {
          code: 'SHARE_OWNER_USER_MISSING_FOR_EMAIL',
          ownerUserId: params.ownerUserId,
          invitationId: result.invitation.id,
        },
      );
    }
    const ownerDisplayName = owner?.username ?? FALLBACK_OWNER_DISPLAY_NAME;
    // Surface the email outcome up the call stack so the UI can warn when the row was
    // created but the email actually failed (Resend down, etc.). `'skipped'` (Resend not
    // configured in dev/test) counts as delivered for the user-facing flag — there's no
    // failure for them to see.
    const outcome = await sendInvitationEmail({
      toEmail: result.resolvedInvitee.email,
      ownerDisplayName,
      resourceType: result.invitation.resourceType,
      resourceName: result.resourceName,
      permission: result.invitation.permission,
      policy: result.invitation.policy,
      token: result.invitation.token,
      expiresAt: new Date(result.invitation.expiresAt),
    });

    if (outcome.status === 'failed') {
      // The API response already carries `emailDelivered: false`, but a single in-flight toast
      // is easy to miss. Drop a durable owner notification so the failed delivery surfaces in
      // the notification center even if the page is dismissed before the toast renders.
      const invitee = await Users.findByPk(result.resolvedInvitee.userId);
      const notify = LIFECYCLE_NOTIFIERS.invitationSendFailed[result.invitation.resourceType];
      await notify({
        ownerUserId: params.ownerUserId,
        invitee,
        inviteeEmail: result.resolvedInvitee.email,
        invitationId: result.invitation.id,
        resource: {
          type: result.invitation.resourceType,
          id: String(result.invitation.resourceId),
          name: result.resourceName,
        },
      });
    }

    return { invitation: result.invitation, emailDelivered: outcome.status !== 'failed' };
  } catch (error) {
    logger.error(
      { message: '[createInvitation] Post-commit fan-out failed', error: error as Error },
      {
        code: 'SHARE_INVITATION_POST_COMMIT_FAILED',
        ownerUserId: params.ownerUserId,
        invitationId: result.invitation.id,
        resourceType: result.invitation.resourceType,
      },
    );
    return { invitation: result.invitation, emailDelivered: false };
  }
};
