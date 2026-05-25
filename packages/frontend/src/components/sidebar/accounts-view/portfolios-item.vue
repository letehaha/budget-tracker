<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { usePortfolioSummary } from '@/composable/data-queries/portfolio-summary';
import { useFormatCurrency } from '@/composable/formatters';
import { ROUTES_NAMES } from '@/routes/constants';
import { PORTFOLIO_TYPE, PortfolioModel } from '@bt/shared/types/investments';
import { Building2Icon, EyeOffIcon, LandmarkIcon, PiggyBankIcon, TrendingUpIcon } from '@lucide/vue';
import { computed, toRef } from 'vue';

const props = defineProps<{
  portfolio: PortfolioModel;
}>();

const portfolioId = toRef(() => props.portfolio.id);
const { data: summary, isLoading: isSummaryLoading } = usePortfolioSummary(portfolioId);
const { formatCompactAmount, formatAmountByCurrencyCode } = useFormatCurrency();

const totalValue = computed(() => (summary.value ? Number(summary.value.totalPortfolioValue) : null));
const currencyCode = computed(() => summary.value?.currencyCode ?? 'USD');

const portfolioIcon = computed(() => {
  switch (props.portfolio.portfolioType) {
    case PORTFOLIO_TYPE.investment:
      return Building2Icon;
    case PORTFOLIO_TYPE.retirement:
      return LandmarkIcon;
    case PORTFOLIO_TYPE.savings:
      return PiggyBankIcon;
    default:
      return TrendingUpIcon;
  }
});
</script>

<template>
  <router-link
    v-slot="{ isActive }"
    :to="{ name: ROUTES_NAMES.portfolioDetail, params: { portfolioId: portfolio.id } }"
    class="flex w-full"
  >
    <Button
      :variant="isActive ? 'secondary' : 'ghost'"
      as="div"
      size="default"
      class="h-auto w-full px-2"
      :class="!portfolio.isEnabled && 'opacity-60'"
    >
      <div class="flex w-full items-center justify-between gap-x-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <component :is="portfolioIcon" class="text-muted-foreground size-3.5 shrink-0" />
          <span class="truncate text-sm">{{ portfolio.name }}</span>
          <EyeOffIcon v-if="!portfolio.isEnabled" class="text-muted-foreground size-3 shrink-0" />
        </div>
        <template v-if="isSummaryLoading">
          <div class="bg-muted/30 h-3.5 w-12 shrink-0 animate-pulse rounded" />
        </template>
        <DesktopOnlyTooltip
          v-else-if="totalValue !== null"
          :content="formatAmountByCurrencyCode(totalValue, currencyCode)"
        >
          <span class="text-amount text-muted-foreground shrink-0 text-sm">
            {{ formatCompactAmount(totalValue, currencyCode) }}
          </span>
        </DesktopOnlyTooltip>
      </div>
    </Button>
  </router-link>
</template>
