<template>
  <div class="space-y-5">
    <div v-for="group in groups" :key="group.label" class="space-y-2">
      <p class="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
        {{ group.label }}
        <span class="text-foreground ml-1 text-xs font-extrabold tracking-normal normal-case">{{
          formatBaseCurrency(group.total)
        }}</span>
        <span v-if="group.hint" class="ml-1 font-medium tracking-normal normal-case">· {{ group.hint }}</span>
      </p>
      <div class="space-y-0.5">
        <div
          v-for="node in group.nodes"
          :key="node.id"
          class="relative grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-[13px]"
        >
          <span
            class="absolute inset-y-0 left-0 opacity-10"
            :style="{ width: `${node.share * 100}%`, background: nodeColor({ node, colors, fallback: group.color }) }"
          />
          <span
            class="relative size-2 rounded-xs"
            :style="{ background: nodeColor({ node, colors, fallback: group.color }) }"
          />
          <span class="relative truncate font-semibold">{{ nodeLabel({ node, t }) }}</span>
          <span class="relative font-semibold tabular-nums">{{ formatBaseCurrency(node.value) }}</span>
          <span class="text-muted-foreground relative min-w-8 text-right tabular-nums">{{
            formatShare(node.share)
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFormatCurrency } from '@/composable';
import { useChartColors } from '@/composable/charts/chart-colors';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { type MoneyFlow, formatShare, nodeColor, nodeLabel } from '../utils/build-money-flow';

const props = defineProps<{ flow: MoneyFlow }>();

const { t } = useI18n();
const { formatBaseCurrency } = useFormatCurrency();
const colors = useChartColors();

const groups = computed(() => {
  const { income, expenses, savings, sources, expenseNodes, savingsNodes } = props.flow;
  const ofIncome = (value: number) =>
    income > 0 ? t('analytics.cashFlow.composition.pctOfIncome', { pct: formatShare(value / income) }) : '';
  return [
    { label: t('analytics.cashFlow.income'), total: income, hint: '', nodes: sources, color: colors.value.appIncome },
    {
      label: t('analytics.cashFlow.expenses'),
      total: expenses,
      hint: ofIncome(expenses),
      nodes: expenseNodes,
      color: colors.value.appExpense,
    },
    {
      label: t('analytics.cashFlow.composition.savings'),
      total: savings,
      hint: ofIncome(savings),
      nodes: savingsNodes,
      color: colors.value.appSavings,
    },
  ].filter((g) => g.nodes.length > 0);
});
</script>
