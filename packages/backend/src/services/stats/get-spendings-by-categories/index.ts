import { TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
import type { RecordId } from '@bt/shared/types';
import { getRootCategoryId as resolveRootCategoryId } from '@services/categories/category-hierarchy';
import {
  AccessibleCategoryInfo,
  getAccessibleCategoryMap,
} from '@services/categories/get-accessible-category-map.service';
import { withTransaction } from '@services/common/with-transaction';

import { CategoryAllocations, computeCategoryAllocations } from '../category-allocation';
import { getExpensesHistory } from '../get-expenses-history';

/**
 * Wrapped in a transaction so the expenses read and the allocation/category-map
 * fan-out below share one pinned Postgres connection instead of a pool checkout
 * per query — checkouts from a drained pool trigger slow physical `pg.connect`
 * mid-request.
 */
export const getSpendingsByCategories = withTransaction(
  async (params: {
    userId: number;
    accountId?: string;
    from?: string;
    to?: string;
    categoryIds?: string[];
    transactionType?: TRANSACTION_TYPES;
    excludedCategoryIds?: string[];
  }): Promise<endpointsTypes.GetSpendingsByCategoriesReturnType> => {
    const transactions = await getExpensesHistory(params);

    // Split distribution + refund netting is shared with the pivot report; this service only
    // differs in how the resulting per-category legs are grouped (see `groupAllocations`).
    const [allocations, { categories }] = await Promise.all([
      computeCategoryAllocations({ transactions, applyRefunds: true }),
      getAccessibleCategoryMap({ userId: params.userId }),
    ]);

    return groupAllocations({ categories, allocations, selectedCategoryIds: params.categoryIds });
  },
);

/**
 * Same category grouping as `getSpendingsByCategories`, but split into per-category
 * income and expense buckets in a single response. The category-spending-tracker widget
 * needs both directions per category (to show net = income - expense); returning them
 * together lets it issue one request instead of one per transaction type.
 *
 * Runs the two type-scoped computations concurrently and merges by category, so the
 * refund/split adjustment logic stays shared and untouched.
 */
export async function getSpendingsByCategoriesByType(params: {
  userId: number;
  accountId?: string;
  from?: string;
  to?: string;
  categoryIds?: string[];
  excludedCategoryIds?: string[];
}): Promise<endpointsTypes.GetSpendingsByCategoriesByTypeReturnType> {
  const [expenseByCategory, incomeByCategory] = await Promise.all([
    getSpendingsByCategories({ ...params, transactionType: TRANSACTION_TYPES.expense }),
    getSpendingsByCategories({ ...params, transactionType: TRANSACTION_TYPES.income }),
  ]);

  const result: endpointsTypes.GetSpendingsByCategoriesByTypeReturnType = {};

  for (const categoryId of new Set([
    ...Object.keys(expenseByCategory),
    ...Object.keys(incomeByCategory),
  ]) as Set<RecordId>) {
    const expenseBucket = expenseByCategory[categoryId];
    const incomeBucket = incomeByCategory[categoryId];
    // A category present in either map always carries name/color; prefer whichever exists.
    const meta = expenseBucket ?? incomeBucket!;

    result[categoryId] = {
      name: meta.name,
      color: meta.color,
      income: incomeBucket?.amount ?? 0,
      expense: expenseBucket?.amount ?? 0,
    };
  }

  return result;
}

/**
 * Rolls the flat category-allocation legs up into the shape this report returns.
 *
 * Grouping depends on the request: with no `selectedCategoryIds` every leg rolls up to its root
 * category; with a selection each leg rolls up to its nearest selected ancestor (and every
 * selected category is seeded to 0 so it always shows). A refund leg only subtracts when its
 * group already received spend — a refund whose original expense fell outside the range/filter
 * never conjures a phantom negative row.
 */
function groupAllocations({
  categories,
  allocations,
  selectedCategoryIds,
}: {
  categories: AccessibleCategoryInfo[];
  allocations: CategoryAllocations;
  selectedCategoryIds?: string[];
}): endpointsTypes.GetSpendingsByCategoriesReturnType {
  const categoryMap = new Map<string, AccessibleCategoryInfo>(categories.map((cat) => [cat.id, cat]));
  const result: endpointsTypes.GetSpendingsByCategoriesReturnType = {};
  const selectedSet = selectedCategoryIds ? new Set<string>(selectedCategoryIds) : null;

  // Cache category -> group id to avoid repeated hierarchy walks.
  const groupCache = new Map<string, string | null>();

  const getRootId = (categoryId: string): string => {
    const cached = groupCache.get(categoryId);
    if (cached !== undefined) return cached!;
    const rootId = resolveRootCategoryId({ categoryId, byId: categoryMap });
    groupCache.set(categoryId, rootId);
    return rootId;
  };

  // Nearest selected ancestor (including self), or null when none is selected.
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

  const getGroupId = (categoryId: string): string | null =>
    selectedSet ? getSelectedGroupId(categoryId) : getRootId(categoryId);

  // Pre-seed every selected category so it appears even with no matching spend.
  if (selectedSet) {
    for (const catId of selectedSet) {
      const cat = categoryMap.get(catId);
      result[catId] = { amount: 0, name: cat ? cat.name : 'Unknown', color: cat ? cat.color : '#000000' };
    }
  }

  for (const leg of allocations.base) {
    if (leg.categoryId === null) continue;
    const groupId = getGroupId(leg.categoryId);
    if (groupId === null) continue;

    const existing = result[groupId];
    if (existing) {
      existing.amount += leg.cents;
    } else {
      const groupCategory = categoryMap.get(groupId);
      result[groupId] = {
        amount: leg.cents,
        name: groupCategory ? groupCategory.name : 'Unknown',
        color: groupCategory ? groupCategory.color : '#000000',
      };
    }
  }

  for (const leg of allocations.refunds) {
    if (leg.categoryId === null) continue;
    const groupId = getGroupId(leg.categoryId);
    if (groupId === null) continue;

    // Guard: only net against a group that actually received spend in range. `leg.cents` is
    // already negative.
    const existing = result[groupId];
    if (existing) existing.amount += leg.cents;
  }

  return result;
}
