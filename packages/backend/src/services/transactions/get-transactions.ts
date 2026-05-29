import BudgetTransactions, { type BudgetTransactionMetadata } from '@models/budget-transactions.model';
import Budgets from '@models/budget.model';
import * as Transactions from '@models/transactions.model';
import Users from '@models/users.model';
import { Op } from '@sequelize/core';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';
import { getAccessibleBudgetIdsForUser } from '@services/sharing/auth/get-accessible-budget-ids.service';

type FindWithFiltersParams = Parameters<typeof Transactions.findWithFilters>[0];

/** `userId` is required at the public service boundary even though the model makes it
 * optional — the service still needs the caller identity to compute accessible
 * accounts. The model treats it as optional so this service can drop it on the way
 * through (account-scoped query). */
type GetTransactionsParams = Omit<FindWithFiltersParams, 'isRaw' | 'userId'> & { userId: number };

/** Internal snapshot of the user who attached a tx to a shared budget. `null` for
 *  owner-attached rows and for non-budget-scoped fetches. The public-facing shape is
 *  declared on `TransactionModel.addedBy` in `@bt/shared/types`. */
interface TransactionAddedBy {
  id: number;
  username: string;
  avatar: string | null;
}

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
 * If the caller passes `budgetIds`, visibility is widened: budget-share grants per-
 * budget visibility independent of which underlying account a tx lives in. A `read`+
 * recipient on a shared budget sees every tx attached to that budget, including
 * owner-attached rows on accounts the recipient doesn't otherwise have access to.
 * When both `budgetIds` and `accountIds` are provided, both filters apply (intersect).
 *
 * Recipient-attached rows on a shared budget carry an `addedBy` user snapshot so the
 * UI can label them ("Added by @bob"). Owner-attached rows leave `addedBy` undefined.
 *
 * Internal callers that should remain owner-scoped (csv-import, tag-reminders, budgets
 * stats, etc.) call `Transactions.findWithFilters` directly with `userId` set.
 */
export const getTransactions = async (params: GetTransactionsParams) => {
  const { userId, accountIds, budgetIds, ...rest } = params;

  // Budget-share path: when the caller asks for transactions in specific budgets, we
  // scope visibility through budget-share (in addition to any account-share lookup,
  // not instead of it). Inaccessible budget ids are silently dropped — same shape as
  // the inaccessible-account behaviour above, so the response is "empty" rather than
  // "403" when the caller filters to something they can't see.
  let scopedBudgetIds: string[] | undefined;
  let budgetGrantsVisibility = false;
  if (budgetIds && budgetIds.length > 0) {
    const accessibleBudgets = await getAccessibleBudgetIdsForUser({ userId });
    const accessibleSet = new Set(accessibleBudgets);
    scopedBudgetIds = budgetIds.filter((id) => accessibleSet.has(id));
    if (scopedBudgetIds.length === 0) return [];
    budgetGrantsVisibility = true;
  }

  // Account-share path: if budgets grant visibility we skip the account filter (budget
  // membership is the source of truth for what's in the budget). If the caller passed
  // `accountIds` we still intersect with their accessible-account set so an explicit
  // account filter is honoured.
  let scopedAccountIds: string[] | undefined;
  if (budgetGrantsVisibility) {
    if (accountIds && accountIds.length > 0) {
      const accessibleAccounts = await getAccessibleAccountIdsForUser({ userId });
      const accessibleSet = new Set(accessibleAccounts);
      scopedAccountIds = accountIds.filter((id) => accessibleSet.has(id));
      if (scopedAccountIds.length === 0) return [];
    }
    // else: leave undefined → no account filter, full budget visibility.
  } else {
    const accessibleAccounts = await getAccessibleAccountIdsForUser({ userId });
    if (accountIds && accountIds.length > 0) {
      const accessibleSet = new Set(accessibleAccounts);
      scopedAccountIds = accountIds.filter((id) => accessibleSet.has(id));
      if (scopedAccountIds.length === 0) return [];
    } else {
      if (!accessibleAccounts.length) return [];
      scopedAccountIds = accessibleAccounts;
    }
  }

  // When includeSplits, includeTags, or includeGroups is true, we need nested data (not raw) to preserve array structure
  // Raw mode flattens nested includes into dot-notation keys which breaks access
  const isRaw = !rest.includeSplits && !rest.includeTags && !rest.includeGroups;

  const transactions = await Transactions.findWithFilters({
    ...rest,
    accountIds: scopedAccountIds,
    budgetIds: scopedBudgetIds,
    isRaw,
  });

  if (!transactions.length || !budgetGrantsVisibility) return transactions;

  // Budget-scoped fetch — enrich each row with `addedBy` so the UI can label recipient
  // contributions. Owner-attached rows leave `metadata` null in the junction, so they
  // get `addedBy = null` here and the chip stays hidden client-side.
  //
  // Write-access (`canEdit`) is deliberately NOT computed in this bulk path. It would
  // pay extra share-query work on every list response to cover the ~1/1000 case where
  // a row is visible via a budget share but the caller can't write to its parent
  // account. Instead, the FE checks edit access lazily on dialog open via
  // GET /transactions/:id (which surfaces `canEdit` for free from the already-resolved
  // access result) when the parent account isn't in its local `accountsRecord`.
  return attachAddedByMetadata({ transactions, budgetIds: scopedBudgetIds! });
};

const attachAddedByMetadata = async <T extends { id: string }>({
  transactions,
  budgetIds,
}: {
  transactions: T[];
  budgetIds: string[];
}): Promise<(T & { addedBy?: TransactionAddedBy | null })[]> => {
  const txIds = transactions.map((tx) => tx.id);

  // Pull the junction rows for every (budget, tx) pair in scope so we can derive both
  // the recipient who attached the row (from `metadata.addedByUserId`) AND, when the
  // row was attached by the owner, the budget owner's userId (via the budget). The
  // frontend filters the chip by "viewer ≠ attacher", so we surface the attacher on
  // EVERY row, not just the recipient-attached ones — without that, a recipient
  // viewing an owner-attached row wouldn't know who put it in the budget.
  const [junctionRows, budgetRows] = await Promise.all([
    BudgetTransactions.findAll({
      where: {
        budgetId: { [Op.in]: budgetIds },
        transactionId: { [Op.in]: txIds },
      },
      attributes: ['transactionId', 'budgetId', 'metadata'],
      raw: true,
    }) as unknown as Promise<
      Array<{ transactionId: string; budgetId: string; metadata: BudgetTransactionMetadata | null }>
    >,
    Budgets.findAll({
      where: { id: { [Op.in]: budgetIds } },
      attributes: ['id', 'userId'],
      raw: true,
    }) as unknown as Promise<Array<{ id: string; userId: number }>>,
  ]);

  const budgetOwnerByBudgetId = new Map<string, number>(budgetRows.map((b) => [b.id, b.userId]));

  // For each tx, pick a single attacher userId: the recipient who stamped metadata if
  // present, else the owner of the budget this row is in. A tx can be attached to
  // multiple budgets in theory, but our budget-scoped fetch already constrains the
  // junction lookup; in that case the first row wins, which is fine — the chip is
  // about "who put this in this budget context".
  const attacherUserIdByTx = new Map<string, number>();
  for (const row of junctionRows) {
    if (attacherUserIdByTx.has(row.transactionId)) continue;
    const recipientId = row.metadata?.addedByUserId;
    if (typeof recipientId === 'number') {
      attacherUserIdByTx.set(row.transactionId, recipientId);
    } else {
      const ownerId = budgetOwnerByBudgetId.get(row.budgetId);
      if (typeof ownerId === 'number') attacherUserIdByTx.set(row.transactionId, ownerId);
    }
  }

  if (!attacherUserIdByTx.size) {
    return transactions.map((tx) => Object.assign(tx, { addedBy: null }));
  }

  const uniqueUserIds = Array.from(new Set(attacherUserIdByTx.values()));
  const users = (await Users.findAll({
    where: { id: { [Op.in]: uniqueUserIds } },
    attributes: ['id', 'username', 'avatar'],
    raw: true,
  })) as unknown as Array<{ id: number; username: string; avatar: string | null }>;
  const userById = new Map(users.map((u) => [u.id, u]));

  return transactions.map((tx) => {
    const uid = attacherUserIdByTx.get(tx.id);
    if (uid === undefined) return Object.assign(tx, { addedBy: null });
    const user = userById.get(uid);
    return Object.assign(tx, {
      addedBy: user ? { id: user.id, username: user.username, avatar: user.avatar } : null,
    });
  });
};
