import { TransactionModel } from '@bt/shared/types';
import { computed, ref, triggerRef } from 'vue';

import { useShiftMultiSelect } from './shift-multi-select';

interface UseTransactionSelectionOptions {
  getTransactions: () => TransactionModel[];
}

export function useTransactionSelection({ getTransactions }: UseTransactionSelectionOptions) {
  // Use ref with Set for better reactivity tracking
  const selectedIds = ref(new Set<number>());

  // Wrapper to trigger reactivity when Set is modified
  const triggerUpdate = () => triggerRef(selectedIds);

  const { handleSelection, resetSelection, isShiftKeyPressed } = useShiftMultiSelect(selectedIds.value, triggerUpdate);

  const selectedCount = computed(() => selectedIds.value.size);

  const isTransactionSelectable = (tx: TransactionModel): boolean => {
    // Split transactions are not selectable
    if (tx.splits && tx.splits.length > 0) {
      return false;
    }
    return true;
  };

  const isAllSelected = computed(() => {
    const transactions = getTransactions();
    const selectableTransactions = transactions.filter(isTransactionSelectable);
    return selectableTransactions.length > 0 && selectedIds.value.size === selectableTransactions.length;
  });

  const isTransactionSelected = (id: number): boolean => {
    return selectedIds.value.has(id);
  };

  const toggleTransaction = ({ value, id }: { value: boolean; id: number }) => {
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

  const getSelectedTransactionIds = (): number[] => {
    return Array.from(selectedIds.value);
  };

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
