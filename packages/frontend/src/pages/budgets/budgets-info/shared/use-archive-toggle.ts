import { archiveBudget as archiveBudgetApi } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { BUDGET_STATUSES } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { type Ref, computed } from 'vue';

export function useArchiveToggle({ budgetData, budgetId }: { budgetData: Ref; budgetId: Ref<number> }) {
  const queryClient = useQueryClient();

  const isBudgetArchived = computed(() => budgetData.value?.status === BUDGET_STATUSES.archived);

  const handleToggleArchive = async () => {
    await archiveBudgetApi({ budgetId: budgetId.value, isArchived: !isBudgetArchived.value });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList }),
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, budgetId.value] }),
    ]);
  };

  return { isBudgetArchived, handleToggleArchive };
}
