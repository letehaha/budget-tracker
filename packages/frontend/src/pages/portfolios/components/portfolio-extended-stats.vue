<template>
  <Collapsible v-model:open="isOpen">
    <CollapsibleTrigger
      class="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1.5 border-t pt-4 text-sm font-medium transition-colors"
    >
      {{ isOpen ? $t('portfolioExtendedStats.hideMore') : $t('portfolioExtendedStats.showMore') }}
      <ChevronDownIcon class="size-4 transition-transform" :class="{ 'rotate-180': isOpen }" />
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div class="pt-5">
        <!-- Loading state -->
        <div v-if="isLoading" class="grid grid-cols-2 gap-4 @md/balance:grid-cols-4">
          <div v-for="i in 8" :key="i" class="space-y-1.5">
            <div class="bg-muted h-3 w-20 animate-pulse rounded" />
            <div class="bg-muted h-5 w-24 animate-pulse rounded" />
          </div>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="text-destructive-text py-4 text-center text-sm">
          {{ $t('portfolioExtendedStats.loadError') }}
        </div>

        <!-- Stats content -->
        <div v-else-if="stats" class="space-y-6">
          <!-- Activity -->
          <Section :title="$t('portfolioExtendedStats.sections.activity')">
            <Stat :label="$t('portfolioExtendedStats.totalDeposits')" :value="money(stats.totalDeposits)" />
            <Stat :label="$t('portfolioExtendedStats.totalWithdrawals')" :value="money(stats.totalWithdrawals)" />
            <Stat :label="$t('portfolioExtendedStats.netInvested')" :value="money(stats.netInvested)" emphasize />
            <Stat :label="$t('portfolioExtendedStats.totalDividends')" :value="money(stats.totalDividends)" />
            <Stat
              :label="$t('portfolioExtendedStats.averageMonthlyDividends')"
              :value="stats.averageMonthlyDividends === null ? '—' : money(stats.averageMonthlyDividends)"
            />
            <Stat
              :label="$t('portfolioExtendedStats.portfolioAge')"
              :value="formatPortfolioAge(stats.portfolioAgeDays, stats.firstTransactionDate)"
            />
          </Section>

          <!-- Returns -->
          <Section :title="$t('portfolioExtendedStats.sections.returns')">
            <Stat
              :label="$t('portfolioExtendedStats.irr')"
              :value="formatPercent(stats.irr)"
              :tone="percentTone(stats.irr)"
              :hint="$t('portfolioExtendedStats.irrHint')"
            />
            <Stat
              :label="$t('portfolioExtendedStats.twr')"
              :value="formatPercent(stats.twr)"
              :tone="percentTone(stats.twr)"
              :hint="$t('portfolioExtendedStats.twrHint')"
            />
          </Section>

          <!-- Top performers -->
          <Section v-if="hasAnyPerformer" :title="$t('portfolioExtendedStats.sections.topHoldings')">
            <PerformerCard
              v-if="stats.bestPerformerByPercent"
              :label="$t('portfolioExtendedStats.bestByPercent')"
              :performer="stats.bestPerformerByPercent"
              :currency-code="stats.currencyCode"
              tone="positive"
            />
            <PerformerCard
              v-if="stats.worstPerformerByPercent"
              :label="$t('portfolioExtendedStats.worstByPercent')"
              :performer="stats.worstPerformerByPercent"
              :currency-code="stats.currencyCode"
              tone="negative"
            />
            <PerformerCard
              v-if="stats.bestPerformerByValue"
              :label="$t('portfolioExtendedStats.bestByValue')"
              :performer="stats.bestPerformerByValue"
              :currency-code="stats.currencyCode"
              tone="positive"
            />
            <PerformerCard
              v-if="stats.worstPerformerByValue"
              :label="$t('portfolioExtendedStats.worstByValue')"
              :performer="stats.worstPerformerByValue"
              :currency-code="stats.currencyCode"
              tone="negative"
            />
          </Section>

          <!-- Closed positions -->
          <Section v-if="stats.closedPositionsCount > 0" :title="$t('portfolioExtendedStats.sections.closedPositions')">
            <Stat :label="$t('portfolioExtendedStats.closedCount')" :value="String(stats.closedPositionsCount)" />
            <Stat
              :label="$t('portfolioExtendedStats.winRate')"
              :value="`${parseFloat(stats.winRate).toFixed(1)}%`"
              :hint="
                $t('portfolioExtendedStats.winRateHint', {
                  winning: stats.winningPositionsCount,
                  total: stats.closedPositionsCount,
                })
              "
            />
            <Stat
              :label="$t('portfolioExtendedStats.avgReturnDollar')"
              :value="money(stats.avgReturnPerClosedPosition)"
              :tone="percentTone(stats.avgReturnPerClosedPosition)"
            />
            <Stat
              :label="$t('portfolioExtendedStats.avgReturnPercent')"
              :value="formatPercent(stats.avgReturnPerClosedPositionPercent)"
              :tone="percentTone(stats.avgReturnPerClosedPositionPercent)"
            />
          </Section>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { usePortfolioExtendedStats } from '@/composable/data-queries/portfolio-extended-stats';
import { useFormatCurrency } from '@/composable/formatters';
import { useCurrenciesStore } from '@/stores/currencies';
import { differenceInDays, differenceInMonths, differenceInYears, format, parseISO } from 'date-fns';
import { ChevronDownIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

import PerformerCard from './portfolio-extended-stats-performer.vue';
import Section from './portfolio-extended-stats-section.vue';
import Stat from './portfolio-extended-stats-stat.vue';

const props = defineProps<{ portfolioId: number }>();
const portfolioId = toRef(props, 'portfolioId');

const isOpen = ref(false);
const { t } = useI18n();

const { data: stats, isLoading, error } = usePortfolioExtendedStats(portfolioId, { enabled: isOpen });

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { currencies } = storeToRefs(useCurrenciesStore());

const money = (decimalString: string) => {
  if (!stats.value) return decimalString;
  const userCurrency = currencies.value.find((c) => c.currency?.code === stats.value!.currencyCode.toUpperCase());
  const amount = parseFloat(decimalString);
  if (!userCurrency) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return formatAmountByCurrencyCode(amount, userCurrency.currencyCode);
};

const formatPercent = (value: string | null): string => {
  if (value === null) return '—';
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};

const percentTone = (value: string | null): 'positive' | 'negative' | undefined => {
  if (value === null) return undefined;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n > 0 ? 'positive' : 'negative';
};

const formatPortfolioAge = (days: number, firstDate: string | null): string => {
  if (!firstDate || days <= 0) return '—';
  const start = parseISO(firstDate);
  const now = new Date();
  const years = differenceInYears(now, start);
  const months = differenceInMonths(now, start) - years * 12;
  const totalDays = differenceInDays(now, start);

  if (years > 0) {
    return t('portfolioExtendedStats.ageYearsMonths', { years, months, since: format(start, 'MMM d, yyyy') });
  }
  if (months > 0) {
    return t('portfolioExtendedStats.ageMonths', { months, since: format(start, 'MMM d, yyyy') });
  }
  return t('portfolioExtendedStats.ageDays', { days: totalDays, since: format(start, 'MMM d, yyyy') });
};

const hasAnyPerformer = computed(() => {
  if (!stats.value) return false;
  return Boolean(
    stats.value.bestPerformerByPercent ||
    stats.value.worstPerformerByPercent ||
    stats.value.bestPerformerByValue ||
    stats.value.worstPerformerByValue,
  );
});
</script>
