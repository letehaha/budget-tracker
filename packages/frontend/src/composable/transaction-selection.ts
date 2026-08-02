import { useAccountsStore } from '@/stores';
import { TransactionModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed, ref, triggerRef, watch } from 'vue';

import { useShiftMultiSelect } from './shift-multi-select';

/**
 * Why a row is locked out of bulk selection. Consumers compute it per row
 * (mirroring `isTransactionSelectable` + their `isExtraSelectable` predicate)
 * and rows render it as an explainer tooltip in place of the checkbox.
 */
export type BulkUnselectableReason = 'split' | 'sharedAccount';

/**
 * Per-row bulk-selection eligibility shared by the transactions list and table.
 *
 * Transactions on accounts shared *with* the caller are locked out — the bulk
 * endpoints filter by `userId`, so including them silently no-ops and surfaces
 * a confusing "0 transactions updated" toast. Owner-side shares
 * (`share.isOwner === true`) stay bulk-editable.
 */
export function useBulkSelectability() {
  const { accountsRecord } = storeToRefs(useAccountsStore());

  const isBulkSelectable = (tx: TransactionModel) => {
    const share = accountsRecord.value[tx.accountId]?.share;
    return !share || share.isOwner;
  };

  // Mirrors isTransactionSelectable (split rule) + isBulkSelectable, but says why —
  // rows surface it as a tooltip in place of the checkbox.
  const getUnselectableReason = (tx: TransactionModel): BulkUnselectableReason | null => {
    if (tx.splits && tx.splits.length > 0) return 'split';
    if (!isBulkSelectable(tx)) return 'sharedAccount';
    return null;
  };

  return { isBulkSelectable, getUnselectableReason };
}

interface UseTransactionSelectionOptions {
  getTransactions: () => TransactionModel[];
  /**
   * Optional caller-supplied predicate layered on top of the built-in selectability
   * rules (e.g., split parents are never selectable). Lets callers lock out rows the
   * downstream bulk endpoint can't handle, so the toolbar never offers an action
   * that silently no-ops on submit.
   */
  isExtraSelectable?: (tx: TransactionModel) => boolean;
  /**
   * Identity of the result set the rows come from — filters plus sorting. A new
   * identity restarts the infinite query at page one, so the selection is
   * cleared outright instead of pruned down to the rows that page still holds.
   */
  getScopeKey?: () => string | undefined;
}

/**
 * Selected ids that are no longer among the loaded rows. An empty `loadedIds`
 * yields nothing on purpose: both views are infinite-scroll, so a momentarily
 * empty list means a refetch is in flight, not that the user's selection is gone.
 */
export function getVanishedSelectedIds({
  selectedIds,
  loadedIds,
}: {
  selectedIds: Iterable<string>;
  loadedIds: string[];
}): string[] {
  if (loadedIds.length === 0) return [];
  const loaded = new Set(loadedIds);
  return Array.from(selectedIds).filter((id) => !loaded.has(id));
}

export function useTransactionSelection({
  getTransactions,
  isExtraSelectable,
  getScopeKey,
}: UseTransactionSelectionOptions) {
  // Use ref with Set for better reactivity tracking
  const selectedIds = ref(new Set<string>());

  // Wrapper to trigger reactivity when Set is modified
  const triggerUpdate = () => triggerRef(selectedIds);

  const { handleSelection, resetSelection, isShiftKeyPressed } = useShiftMultiSelect(selectedIds.value, triggerUpdate);

  const selectedCount = computed(() => selectedIds.value.size);

  const isTransactionSelectable = (tx: TransactionModel): boolean => {
    // Split transactions are not selectable
    if (tx.splits && tx.splits.length > 0) {
      return false;
    }
    if (isExtraSelectable && !isExtraSelectable(tx)) {
      return false;
    }
    return true;
  };

  const isAllSelected = computed(() => {
    const transactions = getTransactions();
    const selectableTransactions = transactions.filter(isTransactionSelectable);
    return selectableTransactions.length > 0 && selectedIds.value.size === selectableTransactions.length;
  });

  const isTransactionSelected = (id: string): boolean => {
    return selectedIds.value.has(id);
  };

  const toggleTransaction = ({ value, id }: { value: boolean; id: string }) => {
    const transactions = getTransactions();

    // Filter to only selectable transactions for range selection
    const selectableTransactions = transactions.filter(isTransactionSelectable);
    const selectableIndex = selectableTransactions.findIndex((tx) => tx.id === id);

    if (selectableIndex === -1) return;

    handleSelection(value, id, selectableIndex, selectableTransactions, (tx) => tx.id);
  };

  const selectAll = () => {
    const transactions = getTransactions();
    transactions.forEach((tx) => {
      if (isTransactionSelectable(tx)) {
        selectedIds.value.add(tx.id);
      }
    });
    triggerUpdate();
  };

  const clearSelection = () => {
    resetSelection();
  };

  const getSelectedTransactionIds = (): string[] => {
    return Array.from(selectedIds.value);
  };

  let observedScopeKey = getScopeKey?.();

  watch(
    () => ({ scopeKey: getScopeKey?.(), transactions: getTransactions() }),
    ({ scopeKey, transactions }) => {
      if (scopeKey !== observedScopeKey) {
        observedScopeKey = scopeKey;
        if (selectedIds.value.size > 0) clearSelection();
        return;
      }

      if (selectedIds.value.size === 0) return;

      const vanished = getVanishedSelectedIds({
        selectedIds: selectedIds.value,
        loadedIds: transactions.map((tx) => tx.id),
      });
      if (vanished.length === 0) return;

      vanished.forEach((id) => selectedIds.value.delete(id));
      triggerUpdate();
    },
  );

  return {
    selectedIds,
    selectedCount,
    isAllSelected,
    isShiftKeyPressed,
    isTransactionSelectable,
    isTransactionSelected,
    toggleTransaction,
    selectAll,
    clearSelection,
    getSelectedTransactionIds,
  };
}
