import type { ACCOUNT_TYPES } from '@bt/shared/types';
import type Accounts from '@models/accounts.model';
import type Users from '@models/users.model';

import type { ShareContext } from './share-context-resolver';
import { buildOwnerContext, loadSharedByIdFor, loadSharedFor } from './share-context-resolver';
import { accountShareable } from './shareables/account.shareable';

/**
 * Per-account share context attached to model instances by the accounts service so the
 * serializer can emit the public-facing `share` block. Identical shape to
 * `BudgetShareContext` — frontend share UI is share-shape-agnostic, so a single shape
 * lets the same components consume both.
 */
export type AccountShareContext = ShareContext;

/**
 * Build the share context for an account the requesting user owns. Permission is
 * implicit `manage`.
 */
export const buildOwnerShareContext = async ({ ownerUser }: { ownerUser: Users }): Promise<AccountShareContext> =>
  buildOwnerContext({ ownerUser });

/**
 * Returns accounts the user has been granted access to (accepted shares only) along
 * with the recipient share context. Visibility unions:
 *   - Per-resource account shares (`resourceType='account'`).
 *   - Accounts owned by users who granted the caller a household membership.
 *
 * Precedence on collision: per-resource share wins (matches
 * `canUserAccessResource`). All loading + matching lives in `accountShareable.sources`.
 */
export const getSharedAccountsForUser = ({
  userId,
  type,
}: {
  userId: number;
  type?: ACCOUNT_TYPES;
}): Promise<Array<Accounts & { _shareContext: AccountShareContext }>> =>
  loadSharedFor({
    userId,
    shareable: accountShareable,
    where: type ? { type } : undefined,
  });

/**
 * Looks up a single shared account by id for the calling user. Returns `null` when
 * the caller is the owner (caller handles the owner branch separately) or has no
 * accepted share.
 */
export const getSharedAccountById = ({
  userId,
  id,
}: {
  userId: number;
  id: string;
}): Promise<(Accounts & { _shareContext: AccountShareContext }) | null> =>
  loadSharedByIdFor({
    userId,
    shareable: accountShareable,
    id,
  });
