import { TRANSACTION_TYPES } from '@bt/shared/types';
import { endpointsTypes } from '@bt/shared/types';
import { UnwrapPromise } from '@common/types';
import * as Categories from '@models/Categories.model';
import RefundTransactions from '@models/RefundTransactions.model';
import Transactions from '@models/Transactions.model';
import TransactionSplits from '@models/TransactionSplits.model';
import { Op } from 'sequelize';

import { getExpensesHistory } from '../get-expenses-history';

type TransactionsParam = UnwrapPromise<ReturnType<typeof getExpensesHistory>>;

// Minimal transaction data needed for refund processing
type TxMapEntry = Pick<TransactionsParam[0], 'id' | 'refAmount' | 'categoryId' | 'transactionType'>;

export async function getSpendingsByCategories(params: {
  userId: number;
  accountId?: number;
  from?: string;
  to?: string;
  categoryIds?: number[];
  transactionType?: TRANSACTION_TYPES;
  excludedCategoryIds?: number[];
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
  const txMap = new Map<number, TxMapEntry>(
    transactions.map((t) => [
      t.id,
      { id: t.id, refAmount: t.refAmount, categoryId: t.categoryId, transactionType: t.transactionType },
    ]),
  );

  // Collect all transaction IDs that need to be fetched (not in current period)
  const missingTxIds = new Set<number>();
  for (const refund of refunds) {
    if (!txMap.has(refund.originalTxId)) missingTxIds.add(refund.originalTxId);
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

  // Fetch splits and categories in parallel
  const allSplitTxIds = [...txIds, ...missingTxIds];
  const [splits, categories] = await Promise.all([
    TransactionSplits.findAll({
      where: {
        [Op.or]: [
          { transactionId: { [Op.in]: allSplitTxIds }, userId: params.userId },
          ...(splitIdsToFetch.size > 0 ? [{ id: { [Op.in]: [...splitIdsToFetch] } }] : []),
        ],
      },
    }),
    Categories.default.findAll({
      where: { userId: params.userId },
      attributes: ['id', 'parentId', 'name', 'color'],
    }),
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
  txIds: number[];
  userId: number;
  selectedCategoryIds?: number[];
}) {
  const [splits, categories] = await Promise.all([
    TransactionSplits.findAll({
      where: { transactionId: { [Op.in]: txIds }, userId },
    }),
    Categories.default.findAll({
      where: { userId },
      attributes: ['id', 'parentId', 'name', 'color'],
    }),
  ]);

  const { splitsByTxId } = groupSplitsByTransactionId({ splits });

  return groupAndAdjustData({
    categories,
    transactions,
    refunds: [],
    splitsByTxId,
    splitsById: new Map(),
    txMap: new Map<number, TxMapEntry>(
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
  categories: Categories.default[];
  transactions: TransactionsParam;
  refunds: RefundTransactions[];
  splitsByTxId: Map<number, TransactionSplits[]>;
  splitsById: Map<string, TransactionSplits>; // UUID keyed
  txMap: Map<number, TxMapEntry>;
  selectedCategoryIds?: number[];
}): endpointsTypes.GetSpendingsByCategoriesReturnType {
  const { categories, transactions, refunds, splitsByTxId, splitsById, txMap, selectedCategoryIds } = params;
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
  const result: endpointsTypes.GetSpendingsByCategoriesReturnType = {};

  const selectedSet = selectedCategoryIds ? new Set(selectedCategoryIds) : null;

  // Cache for category group lookups to avoid repeated traversals
  const groupCache = new Map<number, number | null>();

  // Function to get root category ID with caching (default mode)
  const getRootCategoryId = (categoryId: number): number => {
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
  const getSelectedGroupId = (categoryId: number): number | null => {
    const cached = groupCache.get(categoryId);
    if (cached !== undefined) return cached;

    const visited: number[] = [];
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
  const getGroupId = (categoryId: number): number | null => {
    return selectedSet ? getSelectedGroupId(categoryId) : getRootCategoryId(categoryId);
  };

  // When filtering by selected categories, pre-initialize all selected categories with 0
  if (selectedSet) {
    for (const catId of selectedSet) {
      const cat = categoryMap.get(catId);
      result[catId.toString()] = {
        amount: 0,
        name: cat ? cat.name : 'Unknown',
        color: cat ? cat.color : '#000000',
      };
    }
  }

  // Helper to add amount to a category
  const addToCategory = (categoryId: number, amount: number) => {
    const groupId = getGroupId(categoryId);
    if (groupId === null) return;

    const groupIdStr = groupId.toString();
    const groupCategory = categoryMap.get(groupId);

    if (groupIdStr in result) {
      result[groupIdStr].amount += amount;
    } else {
      result[groupIdStr] = {
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
    const baseTx = txMap.get(refund.originalTxId);
    const refundTx = txMap.get(refund.refundTxId);

    // Skip if we couldn't find the transactions (shouldn't happen with proper pre-fetching)
    if (!baseTx || !refundTx) continue;

    // Determine which category to adjust based on refund target
    let wantedCategoryId: number;

    if (refund.splitId) {
      // Refund targets a specific split - O(1) lookup instead of searching
      const targetSplit = splitsById.get(refund.splitId);
      wantedCategoryId = targetSplit ? targetSplit.categoryId : baseTx.categoryId;
    } else {
      // Refund applies to whole transaction - use expense transaction's category
      wantedCategoryId = baseTx.transactionType === TRANSACTION_TYPES.expense ? baseTx.categoryId : refundTx.categoryId;
    }

    const groupId = getGroupId(wantedCategoryId);
    if (groupId === null) continue;

    const groupIdStr = groupId.toString();
    if (groupIdStr in result) {
      result[groupIdStr].amount -= refundTx.refAmount.toCents();
    }
  }

  return result;
}

function groupSplitsByTransactionId({ splits }: { splits: TransactionSplits[] }): {
  splitsByTxId: Map<number, TransactionSplits[]>;
  splitsById: Map<string, TransactionSplits>;
} {
  const splitsByTxId = new Map<number, TransactionSplits[]>();
  const splitsById = new Map<string, TransactionSplits>();

  for (const split of splits) {
    const existing = splitsByTxId.get(split.transactionId) || [];
    existing.push(split);
    splitsByTxId.set(split.transactionId, existing);
    splitsById.set(split.id, split);
  }

  return { splitsByTxId, splitsById };
}
