import * as Transactions from '@models/transactions.model';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';

type FindWithFiltersParams = Parameters<typeof Transactions.findWithFilters>[0];

/** `userId` is required at the public service boundary even though the model makes it
 * optional — the service still needs the caller identity to compute accessible
 * accounts. The model treats it as optional so this service can drop it on the way
 * through (account-scoped query). */
type GetTransactionsParams = Omit<FindWithFiltersParams, 'isRaw' | 'userId'> & { userId: number };

/**
 * User-facing list of transactions visible to the caller.
 *
 * Visibility scope (PRD F8 + F14): the caller's owned accounts plus accounts shared
 * with them via accepted shares. Creator id (`transaction.userId`) is intentionally not
 * filtered on, so transactions an owner created on a shared account are visible to the
 * recipient too.
 *
 * If the caller passes `accountIds`, we intersect against the accessible set: accounts
 * not in scope are silently dropped (keeping behaviour identical to the previous
 * userId-scoped query for inaccessible accounts — empty result, not 403).
 *
 * Internal callers that should remain owner-scoped (csv-import, tag-reminders, budgets
 * stats, etc.) call `Transactions.findWithFilters` directly with `userId` set.
 */
export const getTransactions = async (params: GetTransactionsParams) => {
  const { userId, accountIds, ...rest } = params;
  const accessible = await getAccessibleAccountIdsForUser({ userId });

  let scopedAccountIds: number[];
  if (accountIds && accountIds.length > 0) {
    const accessibleSet = new Set(accessible);
    scopedAccountIds = accountIds.filter((id) => accessibleSet.has(id));
    if (scopedAccountIds.length === 0) {
      // No overlap — caller filtered to accounts they have no access to. Return early
      // so we don't pass an empty `accountIds` (which would short-circuit to all rows).
      return [];
    }
  } else {
    if (!accessible.length) return [];
    scopedAccountIds = accessible;
  }

  // When includeSplits, includeTags, or includeGroups is true, we need nested data (not raw) to preserve array structure
  // Raw mode flattens nested includes into dot-notation keys which breaks access
  const isRaw = !rest.includeSplits && !rest.includeTags && !rest.includeGroups;
  // Drop `userId`: account-scoped query.
  return Transactions.findWithFilters({ ...rest, accountIds: scopedAccountIds, isRaw });
};
