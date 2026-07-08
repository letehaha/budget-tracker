import { getSpendingsByCategoriesByType } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useRootStore } from '@/stores';
import { type RecordId } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface CategorySpendingItem {
  id: string;
  name: string;
  color: string;
  netAmount: number;
}

export function useCategorySpendingData({
  selectedPeriod,
  categoryIds,
}: {
  selectedPeriod: () => { from: Date; to: Date };
  categoryIds: Ref<string[]>;
}) {
  const { t } = useI18n();
  const { isAppInitialized } = storeToRefs(useRootStore());

  const periodQueryKey = computed(() => `${selectedPeriod().from.getTime()}-${selectedPeriod().to.getTime()}`);
  const categoryIdsQueryKey = computed(() => categoryIds.value.join(','));

  const isEnabled = computed(() => isAppInitialized.value && categoryIds.value.length > 0);

  const { data: spendingData, isFetching } = useQuery({
    queryKey: computed(() => [
      ...VUE_QUERY_CACHE_KEYS.widgetCategorySpendingTracker,
      periodQueryKey.value,
      categoryIdsQueryKey.value,
    ]),
    queryFn: () =>
      getSpendingsByCategoriesByType({
        from: selectedPeriod().from,
        to: selectedPeriod().to,
        categoryIds: categoryIds.value,
      }),
    staleTime: Infinity,
    placeholderData: (previousData) => previousData || {},
    enabled: isEnabled,
  });

  const hasData = computed(() => {
    const data = spendingData.value;
    return data !== undefined && Object.keys(data).length > 0;
  });

  const spendingByCategory = computed<Record<string, CategorySpendingItem>>(() => {
    const result: Record<string, CategorySpendingItem> = {};
    const data = spendingData.value ?? {};

    for (const catId of categoryIds.value) {
      const bucket = data[catId as RecordId];

      result[catId] = {
        id: catId,
        name: bucket?.name ?? t('common.labels.unknown'),
        color: bucket?.color ?? '#000000',
        netAmount: (bucket?.income ?? 0) - (bucket?.expense ?? 0),
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
