import { getSpendingsByCategories } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useRootStore } from '@/stores';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface CategorySpendingItem {
  id: number;
  name: string;
  color: string;
  netAmount: number;
}

export function useCategorySpendingData({
  selectedPeriod,
  categoryIds,
}: {
  selectedPeriod: () => { from: Date; to: Date };
  categoryIds: Ref<number[]>;
}) {
  const { t } = useI18n();
  const { isAppInitialized } = storeToRefs(useRootStore());

  const periodQueryKey = computed(() => `${selectedPeriod().from.getTime()}-${selectedPeriod().to.getTime()}`);
  const categoryIdsQueryKey = computed(() => categoryIds.value.join(','));

  const isEnabled = computed(() => isAppInitialized.value && categoryIds.value.length > 0);

  const { data: expenseData, isFetching: isExpenseFetching } = useQuery({
    queryKey: computed(() => [
      ...VUE_QUERY_CACHE_KEYS.widgetCategorySpendingTracker,
      TRANSACTION_TYPES.expense,
      periodQueryKey.value,
      categoryIdsQueryKey.value,
    ]),
    queryFn: () =>
      getSpendingsByCategories({
        from: selectedPeriod().from,
        to: selectedPeriod().to,
        categoryIds: categoryIds.value,
        type: TRANSACTION_TYPES.expense,
      }),
    staleTime: Infinity,
    placeholderData: (previousData) => previousData || {},
    enabled: isEnabled,
  });

  const { data: incomeData, isFetching: isIncomeFetching } = useQuery({
    queryKey: computed(() => [
      ...VUE_QUERY_CACHE_KEYS.widgetCategorySpendingTracker,
      TRANSACTION_TYPES.income,
      periodQueryKey.value,
      categoryIdsQueryKey.value,
    ]),
    queryFn: () =>
      getSpendingsByCategories({
        from: selectedPeriod().from,
        to: selectedPeriod().to,
        categoryIds: categoryIds.value,
        type: TRANSACTION_TYPES.income,
      }),
    staleTime: Infinity,
    placeholderData: (previousData) => previousData || {},
    enabled: isEnabled,
  });

  const isFetching = computed(() => isExpenseFetching.value || isIncomeFetching.value);
  const hasData = computed(() => {
    const exp = expenseData.value;
    const inc = incomeData.value;
    return (exp !== undefined && Object.keys(exp).length > 0) || (inc !== undefined && Object.keys(inc).length > 0);
  });

  const spendingByCategory = computed<Record<number, CategorySpendingItem>>(() => {
    const result: Record<number, CategorySpendingItem> = {};

    for (const catId of categoryIds.value) {
      const expense = expenseData.value?.[catId];
      const income = incomeData.value?.[catId];

      result[catId] = {
        id: catId,
        name: expense?.name ?? income?.name ?? t('common.labels.unknown'),
        color: expense?.color ?? income?.color ?? '#000000',
        netAmount: (income?.amount ?? 0) - (expense?.amount ?? 0),
      };
    }

    return result;
  });

  return {
    spendingByCategory,
    isFetching,
    hasData,
  };
}
