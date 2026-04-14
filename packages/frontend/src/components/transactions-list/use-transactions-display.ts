import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

import type { GroupRowData } from './transaction-group-record.vue';

type DisplayItem = TransactionModel | GroupRowData;

export function isGroupRow(item: DisplayItem): item is GroupRowData {
  return 'type' in item && item.type === 'group';
}

export function getDisplayItemKey(item: DisplayItem | undefined, index: number): string | number {
  if (!item) return index;
  if (isGroupRow(item)) return `group-${item.groupId}`;
  return `${item.id}-${item.updatedAt}`;
}

interface UseTransactionsDisplayOptions {
  transactions: MaybeRefOrGetter<TransactionModel[]>;
  contentFiltersActive?: MaybeRefOrGetter<boolean>;
  maxDisplay?: MaybeRefOrGetter<number | undefined>;
}

/**
 * Processes raw transactions for display:
 * - Deduplicates transfers (shows expense side of common transfers when both legs are present;
 *   shows whichever single leg is present when only one side is in the list, e.g. account view)
 * - Groups transactions by groupId into collapsed group rows (unless content filters are active)
 * - Applies optional maxDisplay limit
 */
export function useTransactionsDisplay({
  transactions,
  contentFiltersActive,
  maxDisplay,
}: UseTransactionsDisplayOptions) {
  const displayTransactions = computed<DisplayItem[]>(() => {
    const txs = toValue(transactions);
    const filtersActive = toValue(contentFiltersActive) ?? false;
    const max = toValue(maxDisplay);
    // Collect which transferIds have their expense side present in this list.
    // Used to decide whether the income side of a pair should be shown (when the
    // expense side is absent — e.g. account-scoped view) or suppressed (when both
    // sides are present and we only want to show one).
    const transferIdsWithExpense = new Set(
      txs
        .filter(
          (tx) =>
            tx.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer &&
            tx.transactionType === TRANSACTION_TYPES.expense,
        )
        .map((tx) => tx.transferId as string),
    );

    const deduplicated = txs.filter((tx) => {
      if (tx.transferNature !== TRANSACTION_TRANSFER_NATURE.common_transfer) return true;
      if (tx.transactionType === TRANSACTION_TYPES.expense) return true;
      // Income side: only suppress it when the expense side is also in this list
      // (i.e. we're on the all-transactions view). When viewing a single account
      // that only has the income leg, show it.
      return !transferIdsWithExpense.has(tx.transferId as string);
    });

    // When content filters are active, dissolve groups — show individual transactions
    if (filtersActive) {
      return max ? deduplicated.slice(0, max) : deduplicated;
    }

    // Group transactions by groupId and replace with group rows
    const groupedTxs = new Map<number, TransactionModel[]>();
    const ungrouped: TransactionModel[] = [];

    for (const tx of deduplicated) {
      const groupInfo = tx.transactionGroups?.[0];
      if (groupInfo) {
        const existing = groupedTxs.get(groupInfo.id);
        if (existing) {
          existing.push(tx);
        } else {
          groupedTxs.set(groupInfo.id, [tx]);
        }
      } else {
        ungrouped.push(tx);
      }
    }

    // Build display items: ungrouped transactions + group rows at newest member date
    const items: DisplayItem[] = [...ungrouped];

    for (const [groupId, groupTxs] of groupedTxs) {
      const groupName = groupTxs[0]!.transactionGroups![0]!.name;
      const timestamps = groupTxs.map((tx) => new Date(tx.time).getTime());
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      const dateFrom = new Date(minTime);
      const dateTo = new Date(maxTime);

      const groupRow: GroupRowData = {
        type: 'group',
        groupId,
        groupName,
        transactionCount: groupTxs.length,
        dateFrom,
        dateTo,
      };

      // Insert at position of the newest transaction date
      const insertIndex = items.findIndex((item) => {
        const itemTime = isGroupRow(item) ? item.dateTo.getTime() : new Date(item.time).getTime();
        return itemTime <= maxTime;
      });

      if (insertIndex === -1) {
        items.push(groupRow);
      } else {
        items.splice(insertIndex, 0, groupRow);
      }
    }

    return max ? items.slice(0, max) : items;
  });

  return {
    displayTransactions,
  };
}
