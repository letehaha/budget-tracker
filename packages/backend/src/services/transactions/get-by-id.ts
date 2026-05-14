import { ACCESS_SOURCES, RESOURCE_TYPES, SHARE_PERMISSIONS, SharePermission } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import TransactionSplits from '@models/transaction-splits.model';
import TransactionsModel, * as Transactions from '@models/transactions.model';
import { assertOwnScopeOk } from '@services/sharing/auth/authorize-account-write.service';
import {
  type GrantedAccessResult,
  canUserAccessResource,
} from '@services/sharing/auth/can-user-access-resource.service';

import { withTransaction } from '../common/with-transaction';

interface GetTransactionByIdParams {
  id: number;
  userId: number;
  includeSplits?: boolean;
  /** Defaults to `read`. Pass `write` from update/delete callers so the auth check happens once here instead of being re-run in the caller. */
  requiredPermission?: SharePermission;
}

/**
 * Fetch a transaction visible to the caller, paired with the resolved access result.
 *
 * Returns `{ tx, access }` when the caller has at least `requiredPermission` on the
 * transaction's parent account; returns `null` otherwise (so callers can throw a clean
 * 404 with no existence leak). Callers branch on `access.isOwner` and `access.policy`
 * for owner-vs-recipient logic and the `transactionsWriteScope: 'own'` rule, so they
 * don't need to call `canUserAccessResource` themselves.
 *
 * Visibility resolution:
 *   1. Caller authored the row AND owns the parent account → fast path, synthesize
 *      `isOwner: true` with `manage`. Saves a share-table lookup in the common case.
 *   2. Caller authored the row on a *shared* account (parent account belongs to someone
 *      else) → fall through to the share-aware resolver so `ownerUserId` resolves to
 *      the actual account owner. Without this, downstream code that scopes by
 *      `accountOwnerUserId` (category lookup, account currency lookup) would search
 *      under the recipient's userId and miss the owner's rows.
 *   3. Caller did NOT author the row but has an accepted share → granted at the share's
 *      permission level (subject to `requiredPermission`).
 *   4. Anything else → `null` (404 territory).
 */
export const getTransactionById = withTransaction(
  async ({
    id,
    userId,
    includeSplits,
    requiredPermission = SHARE_PERMISSIONS.read,
  }: GetTransactionByIdParams): Promise<{
    tx: Transactions.default;
    access: GrantedAccessResult;
  } | null> => {
    const authored = await Transactions.getTransactionById({ id, userId, includeSplits });
    if (authored) {
      // Verify the parent account also belongs to the caller before synthesizing the
      // owner-fast-path. A recipient who created a tx on a shared account would otherwise
      // be misclassified as "owner of everything", which then makes
      // `accountOwnerUserId === callerUserId` downstream and breaks owner-scoped lookups.
      const parentAccount = (await Accounts.findOne({
        where: { id: authored.accountId },
        attributes: ['userId'],
        raw: true,
      })) as { userId: number } | null;
      if (parentAccount?.userId === userId) {
        return {
          tx: authored,
          access: {
            granted: true,
            isOwner: true,
            effectivePermission: SHARE_PERMISSIONS.manage,
            policy: null,
            ownerUserId: userId,
            accessSource: ACCESS_SOURCES.owner,
          },
        };
      }

      // Caller authored the row on someone else's account — resolve real access info via
      // the share table so `ownerUserId` reflects the actual account owner.
      const access = await canUserAccessResource({
        userId,
        resourceType: RESOURCE_TYPES.account,
        resourceId: authored.accountId,
        requiredPermission,
      });
      if (!access.granted) return null;
      return { tx: authored, access };
    }

    // Caller didn't author the row. Cheap PK lookup first to short-circuit "no such tx"
    // without paying for a share-table query.
    const tx = await TransactionsModel.findOne({ where: { id } });
    if (!tx) return null;

    const access = await canUserAccessResource({
      userId,
      resourceType: RESOURCE_TYPES.account,
      resourceId: tx.accountId,
      requiredPermission,
    });
    if (!access.granted) return null;

    if (includeSplits) {
      const withSplits = await TransactionsModel.findOne({
        where: { id },
        include: [{ model: TransactionSplits, as: 'splits' }],
      });
      return withSplits ? { tx: withSplits, access } : null;
    }
    return { tx, access };
  },
);

interface WritableTransactionAuthContext {
  /** Caller owns the parent account. */
  isOwner: boolean;
  /** UserId to scope owner-scoped lookups (account row, category set) against. */
  accountOwnerUserId: number;
  /** Granted access result, in case callers need the policy / permission level. */
  access: GrantedAccessResult;
}

/**
 * One-shot fetch + write-authorization for a transaction. Combines the share-aware lookup,
 * the `transactionsWriteScope: 'own'` policy check, and the owner-userId resolution that
 * every write-path service used to assemble manually. Returns the transaction together
 * with a pre-resolved `{ isOwner, accountOwnerUserId, access }` context — callers no longer
 * need to know that auth is a three-step composition.
 *
 * Throws:
 *   - `NotFoundError` (404) when the caller has no claim on the row at all (or the row
 *     doesn't exist) — masks existence per F3.
 *   - `Unauthorized` (401) when the caller is a recipient on `'own'` scope and didn't
 *     author the row.
 *
 * Phase-1 cross-boundary guards (transfer / refund / changes-account) stay separate via
 * `assertSharedWritePhase1Guards` — those depend on the *operation* (payload), not the
 * fetched row, so they live at the call site.
 */
export const getWritableTransactionById = withTransaction(
  async ({
    id,
    userId,
    includeSplits,
  }: {
    id: number;
    userId: number;
    includeSplits?: boolean;
  }): Promise<{ tx: Transactions.default; ctx: WritableTransactionAuthContext }> => {
    const fetched = await getTransactionById({
      id,
      userId,
      includeSplits,
      requiredPermission: SHARE_PERMISSIONS.write,
    });
    if (!fetched) {
      throw new NotFoundError({ message: t({ key: 'transactions.transactionIdNotExist' }) });
    }
    const { tx, access } = fetched;
    assertOwnScopeOk({ access, callerUserId: userId, txCreatorUserId: tx.userId });
    return {
      tx,
      ctx: {
        isOwner: access.isOwner,
        accountOwnerUserId: access.ownerUserId,
        access,
      },
    };
  },
);
