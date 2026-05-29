import { TRANSACTION_TYPES } from '@bt/shared/types';
import { endpointsTypes } from '@bt/shared/types';
import { UnwrapPromise } from '@common/types';
import RefundTransactions from '@models/refund-transactions.model';
import TransactionSplits from '@models/transaction-splits.model';
import Transactions from '@models/transactions.model';
import { Op } from '@sequelize/core';
import {
  AccessibleCategoryInfo,
  getAccessibleCategoryMap,
} from '@services/categories/get-accessible-category-map.service';

import { getExpensesHistory } from '../get-expenses-history';

type TransactionsParam = UnwrapPromise<ReturnType<typeof getExpensesHistory>>;

// Minimal transaction data needed for refund processing
type TxMapEntry = Pick<TransactionsParam[0], 'id' | 'refAmount' | 'categoryId' | 'transactionType'>;
type TxId = TransactionsParam[0]['id'];

export async function getSpendingsByCategories(params: {
  userId: number;
  accountId?: string;
  from?: string;
  to?: string;
  categoryIds?: string[];
  transactionType?: TRANSACTION_TYPES;
  excludedCategoryIds?: string[];
}): Promise<endpointsTypes.GetSpendingsByCategoriesReturnType> {
  const transactions = await getExpensesHistory(params);
  const txIds = transactions.map((i) => i.id);
  const txIdsWithRefunds = transactions.filter((i) => i.refundLinked).map((i) => i.id);

  // Skip refund processing if no refund-linked transactions
  if (txIdsWithRefunds.length === 0) {
    return processWithoutRefunds({
      transactions,
      txIds,
      userId: params.userId,
      selectedCategoryIds: params.categoryIds,
    });
  }

  // Fetch refunds for transactions with refund links
  const refunds = await RefundTransactions.findAll({
    where: {
      [Op.or]: [{ refundTxId: { [Op.in]: txIdsWithRefunds } }, { originalTxId: { [Op.in]: txIdsWithRefunds } }],
    },
  });

  // Build transaction Map for O(1) lookup (only storing fields needed for refund processing)
  const txMap = new Map<TxId, TxMapEntry>(
    transactions.map((t) => [
      t.id,
      { id: t.id, refAmount: t.refAmount, categoryId: t.categoryId, transactionType: t.transactionType },
    ]),
  );

  // Collect all transaction IDs that need to be fetched (not in current period)
  const missingTxIds = new Set<TxId>();
  for (const refund of refunds) {
    if (refund.originalTxId && !txMap.has(refund.originalTxId)) missingTxIds.add(refund.originalTxId);
    if (!txMap.has(refund.refundTxId)) missingTxIds.add(refund.refundTxId);
  }

  // Batch fetch missing transactions in single query
  if (missingTxIds.size > 0) {
    const missingTxs = await Transactions.findAll({
      where: { id: { [Op.in]: [...missingTxIds] } },
      attributes: ['id', 'refAmount', 'categoryId', 'transactionType'],
    });
    for (const tx of missingTxs) {
      txMap.set(tx.id, tx);
    }
  }

  // Collect all split IDs that need to be fetched (UUIDs)
  const splitIdsToFetch = new Set<string>();
  for (const refund of refunds) {
    if (refund.splitId) splitIdsToFetch.add(refund.splitId);
  }

  // Fetch splits and categories in parallel. Splits are keyed by transactionId only —
  // tx-level visibility was already established when `getExpensesHistory` filtered by
  // `userId: caller`. A split-level `userId` filter would silently drop rows authored by
  // a different user when editing a shared-account tx (e.g. owner-added splits on a
  // recipient's tx via write/all). Categories cover every owner whose accounts the caller
  // can see, so transactions on a shared account (which reference the owner's categoryId)
  // resolve to a real name/color instead of falling through to "Unknown".
  const allSplitTxIds = [...txIds, ...missingTxIds];
  const [splits, { categories }] = await Promise.all([
    TransactionSplits.findAll({
      where: {
        [Op.or]: [
          { transactionId: { [Op.in]: allSplitTxIds } },
          ...(splitIdsToFetch.size > 0 ? [{ id: { [Op.in]: [...splitIdsToFetch] } }] : []),
        ],
      },
    }),
    getAccessibleCategoryMap({ userId: params.userId }),
  ]);

  // Group splits by transactionId and by id (UUID) for easy lookup
  const { splitsByTxId, splitsById } = groupSplitsByTransactionId({ splits });

  return groupAndAdjustData({
    categories,
    transactions,
    refunds,
    splitsByTxId,
    splitsById,
    txMap,
    selectedCategoryIds: params.categoryIds,
  });
}

// Fast path when no refunds need processing
async function processWithoutRefunds({
  transactions,
  txIds,
  userId,
  selectedCategoryIds,
}: {
  transactions: UnwrapPromise<ReturnType<typeof getExpensesHistory>>;
  txIds: TxId[];
  userId: number;
  selectedCategoryIds?: string[];
}) {
  // Splits are keyed by transactionId only — tx-level visibility was already established
  // by `getExpensesHistory`. See the parallel comment in `processWithRefunds`.
  // Categories cover every owner whose accounts the caller can see (own + shared) so a
  // shared-account tx — forced to use the owner's categoryId — still resolves to its real
  // name/color rather than rendering as "Unknown" / black.
  const [splits, { categories }] = await Promise.all([
    TransactionSplits.findAll({
      where: { transactionId: { [Op.in]: txIds } },
    }),
    getAccessibleCategoryMap({ userId }),
  ]);

  const { splitsByTxId } = groupSplitsByTransactionId({ splits });

  return groupAndAdjustData({
    categories,
    transactions,
    refunds: [],
    splitsByTxId,
    splitsById: new Map(),
    txMap: new Map<TxId, TxMapEntry>(
      transactions.map((t) => [
        t.id,
        { id: t.id, refAmount: t.refAmount, categoryId: t.categoryId, transactionType: t.transactionType },
      ]),
    ),
    selectedCategoryIds,
  });
}

/**
 * Groups transactions refAmounts per category, and adjusts them based on existing refunds and splits.
 * For split transactions:
 * - Primary category gets: transaction.refAmount - sum of splits
 * - Each split category gets: split.refAmount
 */
function groupAndAdjustData(params: {
  categories: AccessibleCategoryInfo[];
  transactions: TransactionsParam;
  refunds: RefundTransactions[];
  splitsByTxId: Map<TxId, TransactionSplits[]>;
  splitsById: Map<string, TransactionSplits>; // UUID keyed
  txMap: Map<TxId, TxMapEntry>;
  selectedCategoryIds?: string[];
}): endpointsTypes.GetSpendingsByCategoriesReturnType {
  const { categories, transactions, refunds, splitsByTxId, splitsById, txMap, selectedCategoryIds } = params;
  const categoryMap = new Map<string, AccessibleCategoryInfo>(categories.map((cat) => [cat.id, cat]));
  const result: endpointsTypes.GetSpendingsByCategoriesReturnType = {};

  const selectedSet = selectedCategoryIds ? new Set<string>(selectedCategoryIds) : null;

  // Cache for category group lookups to avoid repeated traversals
  const groupCache = new Map<string, string | null>();

  // Function to get root category ID with caching (default mode)
  const getRootCategoryId = (categoryId: string): string => {
    const cached = groupCache.get(categoryId);
    if (cached !== undefined) return cached!;

    let currentCategory = categoryMap.get(categoryId);
    while (currentCategory && currentCategory.parentId !== null) {
      currentCategory = categoryMap.get(currentCategory.parentId);
    }
    const rootId = currentCategory ? currentCategory.id : categoryId;
    groupCache.set(categoryId, rootId);
    return rootId;
  };

  // Function to find the nearest selected ancestor for a category (selected categories mode).
  // Walks up the tree from categoryId. Returns the first ancestor (including self) that is
  // in the selected set, or null if none found.
  const getSelectedGroupId = (categoryId: string): string | null => {
    const cached = groupCache.get(categoryId);
    if (cached !== undefined) return cached;

    const visited: string[] = [];
    let current = categoryId;

    while (true) {
      visited.push(current);
      if (selectedSet!.has(current)) {
        for (const v of visited) groupCache.set(v, current);
        return current;
      }
      const cat = categoryMap.get(current);
      if (!cat || cat.parentId === null) break;
      current = cat.parentId;
    }

    for (const v of visited) groupCache.set(v, null);
    return null;
  };

  // Resolve the group ID for a category based on the current mode
  const getGroupId = (categoryId: string): string | null => {
    return selectedSet ? getSelectedGroupId(categoryId) : getRootCategoryId(categoryId);
  };

  // When filtering by selected categories, pre-initialize all selected categories with 0
  if (selectedSet) {
    for (const catId of selectedSet) {
      const cat = categoryMap.get(catId);
      result[catId] = {
        amount: 0,
        name: cat ? cat.name : 'Unknown',
        color: cat ? cat.color : '#000000',
      };
    }
  }

  // Helper to add amount to a category
  const addToCategory = (categoryId: string, amount: number) => {
    const groupId = getGroupId(categoryId);
    if (groupId === null) return;

    const groupCategory = categoryMap.get(groupId);

    if (groupId in result) {
      result[groupId]!.amount += amount;
    } else {
      result[groupId] = {
        amount,
        name: groupCategory ? groupCategory.name : 'Unknown',
        color: groupCategory ? groupCategory.color : '#000000',
      };
    }
  };

  for (const transaction of transactions) {
    const txSplits = splitsByTxId.get(transaction.id);

    if (txSplits && txSplits.length > 0) {
      // Transaction has splits - distribute amounts accordingly
      const splitsRefTotal = txSplits.reduce((sum, split) => sum + split.refAmount.toCents(), 0);
      const primaryAmount = transaction.refAmount.toCents() - splitsRefTotal;

      // Add primary category amount (if > 0)
      if (primaryAmount > 0) {
        addToCategory(transaction.categoryId, primaryAmount);
      }

      // Add each split to its category
      for (const split of txSplits) {
        addToCategory(split.categoryId, split.refAmount.toCents());
      }
    } else {
      // No splits - use the full amount for primary category (original behavior)
      addToCategory(transaction.categoryId, transaction.refAmount.toCents());
    }
  }

  // Adjust amounts based on refunds. Uses exactly refAmount, not amount, because stats always
  // describe ref currency
  for (const refund of refunds) {
    // O(1) Map lookups instead of O(n) array.find()
    if (!refund.originalTxId) continue;
    const baseTx = txMap.get(refund.originalTxId);
    const refundTx = txMap.get(refund.refundTxId);

    // Skip if we couldn't find the transactions (shouldn't happen with proper pre-fetching)
    if (!baseTx || !refundTx) continue;

    // Determine which category to adjust based on refund target
    let wantedCategoryId: string;

    if (refund.splitId) {
      // Refund targets a specific split - O(1) lookup instead of searching
      const targetSplit = splitsById.get(refund.splitId);
      wantedCategoryId = targetSplit ? targetSplit.categoryId : baseTx.categoryId;
    } else {
      // Refund applies to whole transaction - use expense transaction's category
      wantedCategoryId = baseTx.transactionType === TRANSACTION_TYPES.expense ? baseTx.categoryId : refundTx.categoryId;
    }

    if (wantedCategoryId === null) continue;
    const groupId = getGroupId(wantedCategoryId);
    if (groupId === null) continue;

    if (groupId in result) {
      result[groupId]!.amount -= refundTx.refAmount.toCents();
    }
  }

  return result;
}

function groupSplitsByTransactionId({ splits }: { splits: TransactionSplits[] }): {
  splitsByTxId: Map<TxId, TransactionSplits[]>;
  splitsById: Map<string, TransactionSplits>;
} {
  const splitsByTxId = new Map<TxId, TransactionSplits[]>();
  const splitsById = new Map<string, TransactionSplits>();

  for (const split of splits) {
    const existing = splitsByTxId.get(split.transactionId) || [];
    existing.push(split);
    splitsByTxId.set(split.transactionId, existing);
    splitsById.set(split.id, split);
  }

  return { splitsByTxId, splitsById };
}
