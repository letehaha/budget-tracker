import type { StatsResponse } from '@/api/budgets';
import { differenceInDays, format, isPast, isWithinInterval } from 'date-fns';
import { type Ref, computed } from 'vue';

interface BudgetData {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  limitAmount?: number | null;
}

export function useBudgetDetails({
  budgetStats,
  budgetData,
}: {
  budgetStats: Ref<StatsResponse | undefined>;
  budgetData: Ref<BudgetData | undefined>;
}) {
  const stats = computed(() => ({
    expenses: budgetStats.value?.summary.actualExpense || 0,
    income: budgetStats.value?.summary.actualIncome || 0,
    balance: budgetStats.value?.summary.balance || 0,
    utilizationRate: budgetStats.value?.summary.utilizationRate ?? null,
    transactionsCount: budgetStats.value?.summary.transactionsCount || 0,
    firstTransactionDate: budgetStats.value?.summary.firstTransactionDate || null,
    lastTransactionDate: budgetStats.value?.summary.lastTransactionDate || null,
  }));

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return null;
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 2000) return null;
    return format(parsedDate, 'MMM d, yyyy');
  };

  const transactionDateRange = computed(() => {
    const first = stats.value.firstTransactionDate;
    const last = stats.value.lastTransactionDate;
    if (!first && !last) return null;
    return {
      first: first ? formatDate(first) : null,
      last: last ? formatDate(last) : null,
    };
  });

  const getBudgetTimeStatus = computed(() => {
    if (!budgetData.value) return null;
    const startDate = budgetData.value.startDate ? new Date(budgetData.value.startDate) : null;
    const endDate = budgetData.value.endDate ? new Date(budgetData.value.endDate) : null;

    if (startDate && (isNaN(startDate.getTime()) || startDate.getFullYear() < 2000)) return null;
    if (endDate && (isNaN(endDate.getTime()) || endDate.getFullYear() < 2000)) return null;

    if (!startDate && !endDate) return null;

    const now = new Date();

    if (endDate && isPast(endDate)) {
      return { status: 'ended' as const, text: 'Ended' };
    }

    if (startDate && endDate && isWithinInterval(now, { start: startDate, end: endDate })) {
      const daysLeft = differenceInDays(endDate, now);
      if (daysLeft === 0) return { status: 'active' as const, text: 'Last day' };
      if (daysLeft === 1) return { status: 'active' as const, text: '1 day left' };
      return { status: 'active' as const, text: `${daysLeft} days left` };
    }

    if (startDate && !isPast(startDate)) {
      const daysUntil = differenceInDays(startDate, now);
      if (daysUntil === 0) return { status: 'upcoming' as const, text: 'Starts today' };
      if (daysUntil === 1) return { status: 'upcoming' as const, text: 'Starts tomorrow' };
      return { status: 'upcoming' as const, text: `Starts in ${daysUntil} days` };
    }

    if (endDate && !isPast(endDate)) {
      const daysLeft = differenceInDays(endDate, now);
      if (daysLeft === 0) return { status: 'active' as const, text: 'Last day' };
      if (daysLeft === 1) return { status: 'active' as const, text: '1 day left' };
      return { status: 'active' as const, text: `${daysLeft} days left` };
    }

    return null;
  });

  const utilizationColor = computed(() => {
    const rate = stats.value.utilizationRate;
    if (rate === null) return 'bg-muted-foreground';
    if (rate > 90) return 'bg-app-expense-color';
    if (rate > 70) return 'bg-warning-text';
    return 'bg-success-text';
  });

  const utilizationTextColor = computed(() => {
    const rate = stats.value.utilizationRate;
    if (rate === null) return 'text-muted-foreground';
    if (rate > 90) return 'text-app-expense-color';
    if (rate > 70) return 'text-warning-text';
    return 'text-success-text';
  });

  return {
    stats,
    formatDate,
    transactionDateRange,
    getBudgetTimeStatus,
    utilizationColor,
    utilizationTextColor,
  };
}
