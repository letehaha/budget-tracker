import type { SharePermission, SharePolicy } from '@bt/shared/types';
import { RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import {
  type GrantedAccessResult,
  canUserAccessResource,
} from '@services/sharing/auth/can-user-access-resource.service';

interface AuthorizeBudgetAccessResult {
  ownerUserId: number;
  isOwner: boolean;
  effectivePermission: SharePermission;
  policy: SharePolicy | null;
  access: GrantedAccessResult;
}

/**
 * Central read/write authorization for a budget. Mirrors the budget-side equivalent of
 * `authorizeAccountWrite` — central auth check that returns the resolved access context
 * so callers can scope downstream queries against the **owner's** `userId` (recipients
 * see the same numbers the owner would, not their own slice).
 *
 * Throws `NotFoundError` (404) for any denied case (no claim OR insufficient permission).
 * 404 masks existence per the F3 convention — a recipient with `read` who tries `write`
 * shouldn't get a different shape of error than a non-recipient, since both leak the
 * same bit ("yes this budget exists"). Matches `authorizeAccountWrite`.
 */
export const authorizeBudgetAccess = async ({
  userId,
  budgetId,
  requiredPermission,
}: {
  userId: number;
  budgetId: string;
  requiredPermission: SharePermission;
}): Promise<AuthorizeBudgetAccessResult> => {
  const access = await canUserAccessResource({
    userId,
    resourceType: RESOURCE_TYPES.budget,
    resourceId: budgetId,
    requiredPermission,
  });

  if (!access.granted) {
    throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });
  }

  return {
    ownerUserId: access.ownerUserId,
    isOwner: access.isOwner,
    effectivePermission: access.effectivePermission,
    policy: access.policy,
    access,
  };
};

/**
 * Convenience wrapper for read-only paths (stats, spending-stats, category-budget-tx
 * lookups). The required permission is fixed at `read` so callers don't have to import
 * `SHARE_PERMISSIONS` themselves.
 */
export const authorizeBudgetRead = ({ userId, budgetId }: { userId: number; budgetId: string }) =>
  authorizeBudgetAccess({ userId, budgetId, requiredPermission: SHARE_PERMISSIONS.read });
