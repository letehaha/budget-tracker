import { getExpensesAmountForPeriod, getSpendingsByCategories } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { calculatePercentageDifference } from '@/js/helpers';
import { useQuery } from '@tanstack/vue-query';
import { differenceInDays, endOfMonth, format, isSameMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import { type Ref, computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

export interface ChartDataItem {
  categoryId: number;
  name: string;
  color: string;
  amount: number;
}

export function useExpensesStructureData({
  selectedPeriod,
  excludedCategoryIds,
}: {
  selectedPeriod: () => { from: Date; to: Date };
  excludedCategoryIds: Ref<number[]>;
}) {
  const { t } = useI18n();

  const periodQueryKey = ref(`${new Date().getTime()}-${new Date().getTime()}`);

  const hasExcludedStats = computed(() => excludedCategoryIds.value.length > 0);

  const periodLabel = computed(() => {
    const from = selectedPeriod().from;
    const to = selectedPeriod().to;
    const now = new Date();

    if (isSameMonth(now, to) && isSameMonth(from, to)) {
      return t('dashboard.widgets.expensesStructure.today');
    }

    if (isSameMonth(from, to)) {
      return format(to, 'MMMM yyyy');
    }

    const isFromMonthStart = from.getDate() === 1;
    const endOfToMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0);
    const isToMonthEnd = to.getDate() === endOfToMonth.getDate();

    if (isFromMonthStart && isToMonthEnd) {
      return `${format(from, 'MMM yyyy')} - ${format(to, 'MMM yyyy')}`;
    }

    return `${format(from, 'MMM d, yyyy')} - ${format(to, 'MMM d, yyyy')}`;
  });

  watch(
    selectedPeriod,
    () => {
      periodQueryKey.value = `${selectedPeriod().from.getTime()}-${selectedPeriod().to.getTime()}`;
    },
    { deep: true },
  );

  const excludedKey = computed(() => excludedCategoryIds.value.join(','));

  const { data: spendingsByCategories, isFetching: isSpendingsByCategoriesFetching } = useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureTotal, periodQueryKey, excludedKey],
    queryFn: () =>
      getSpendingsByCategories({
        from: selectedPeriod().from,
        to: selectedPeriod().to,
        excludedCategoryIds: excludedCategoryIds.value.length > 0 ? excludedCategoryIds.value : undefined,
      }),
    staleTime: Infinity,
    placeholderData: (previousData) => previousData || {},
  });

  const { data: currentMonthExpense, isFetching: isCurrentMonthExpenseFetching } = useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureCurrentAmount, periodQueryKey, excludedKey],
    queryFn: () =>
      getExpensesAmountForPeriod({
        from: selectedPeriod().from,
        to: selectedPeriod().to,
        excludedCategoryIds: excludedCategoryIds.value.length > 0 ? excludedCategoryIds.value : undefined,
      }),
    staleTime: Infinity,
    placeholderData: (previousData) => previousData || 0,
  });

  // Calculate previous period. For full-month selections, use the full previous month
  // to avoid skipping days (e.g., Feb 28 days vs Jan 31 days).
  // For custom date ranges, fall back to same-duration comparison.
  const prevPeriod = computed(() => {
    const { from, to } = selectedPeriod();

    const isFullMonth = isSameMonth(from, to) && from.getDate() === 1 && to.getDate() === endOfMonth(to).getDate();

    if (isFullMonth) {
      const prevMonth = subMonths(from, 1);
      return { from: startOfMonth(prevMonth), to: endOfMonth(prevMonth) };
    }

    const durationInDays = differenceInDays(to, from) + 1;
    const prevTo = subDays(from, 1);
    const prevFrom = subDays(from, durationInDays);

    return { from: prevFrom, to: prevTo };
  });

  const { data: prevMonthExpense, isFetching: isPrevMonthExpenseFetching } = useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructurePrevAmount, periodQueryKey, excludedKey],
    queryFn: () =>
      getExpensesAmountForPeriod({
        from: prevPeriod.value.from,
        to: prevPeriod.value.to,
        excludedCategoryIds: excludedCategoryIds.value.length > 0 ? excludedCategoryIds.value : undefined,
      }),
    staleTime: Infinity,
    placeholderData: (previousData) => previousData || 0,
  });

  const isWidgetDataFetching = computed(
    () =>
      isSpendingsByCategoriesFetching.value || isCurrentMonthExpenseFetching.value || isPrevMonthExpenseFetching.value,
  );

  const { displayValue: animatedExpense } = useAnimatedNumber({
    value: computed(() => -(currentMonthExpense.value || 0)),
  });

  const expensesDiff = computed(() => {
    const percentage = Number(
      calculatePercentageDifference(currentMonthExpense.value || 0, prevMonthExpense.value || 0),
    ).toFixed(2);
    return Number(percentage);
  });

  const chartData = computed<ChartDataItem[]>(() => {
    const excludedSet = new Set(excludedCategoryIds.value);
    return Object.entries(spendingsByCategories.value || {})
      .filter(([id]) => !excludedSet.has(Number(id)))
      .map(([id, value]) => ({
        categoryId: Number(id),
        name: value.name,
        color: value.color,
        amount: value.amount,
      }));
  });

  const isDataEmpty = computed(() => chartData.value.length === 0);
  const hasData = computed(() => currentMonthExpense.value !== undefined && prevMonthExpense.value !== undefined);
  const totalAmount = computed(() => chartData.value.reduce((sum, item) => sum + item.amount, 0));

  return {
    excludedCategoryIds,
    hasExcludedStats,
    periodLabel,
    spendingsByCategories,
    isWidgetDataFetching,
    animatedExpense,
    expensesDiff,
    chartData,
    isDataEmpty,
    hasData,
    totalAmount,
  };
}
