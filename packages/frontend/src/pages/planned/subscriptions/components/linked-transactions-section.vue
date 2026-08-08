<script setup lang="ts">
import { type SubscriptionDetail, unlinkTransactionsFromSubscription } from '@/api/subscriptions';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useInvalidateSubscriptionQueries } from '@/composable/data-queries/subscriptions';
import { useFormatCurrency } from '@/composable/formatters';
import { SUBSCRIPTION_MATCH_SOURCE, TRANSACTION_TYPES } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { format } from 'date-fns';
import { LinkIcon, SearchIcon, SettingsIcon, UnlinkIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  type LinkedPaymentsChartBar,
  type LinkedPaymentsCurrencyTotal,
  buildLinkedPaymentsSummary,
} from '../linked-payments-summary';

type LinkedTransaction = NonNullable<SubscriptionDetail['transactions']>[number];

const props = defineProps<{ subscription: SubscriptionDetail }>();

const emit = defineEmits<{
  'suggest-matches': [];
  'open-automation': [];
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const invalidateSubscriptionQueries = useInvalidateSubscriptionQueries();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const summary = computed(() => buildLinkedPaymentsSummary({ transactions: props.subscription.transactions ?? [] }));

const hasMatchingRules = computed(() => (props.subscription.matchingRules?.rules?.length ?? 0) > 0);

const { mutate: unlinkTransaction, isPending: isUnlinking } = useMutation({
  mutationFn: unlinkTransactionsFromSubscription,
  onSuccess: () => {
    invalidateSubscriptionQueries();
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    addSuccessNotification(t('planned.subscriptions.unlinkSuccess'));
  },
  onError: () => addErrorNotification(t('planned.subscriptions.unlinkError')),
});

const handleUnlink = ({ transactionId }: { transactionId: string }) =>
  unlinkTransaction({ id: props.subscription.id, transactionIds: [transactionId] });

const formatTotals = ({ totals }: { totals: LinkedPaymentsCurrencyTotal[] }): string =>
  totals.map(({ currencyCode, total }) => formatAmountByCurrencyCode(total, currencyCode)).join(' + ');

const primaryTotal = computed(() => {
  const [dominant] = summary.value.stats.totalsByCurrency;
  return dominant ? formatAmountByCurrencyCode(dominant.total, dominant.currencyCode) : '–';
});

const secondaryTotals = computed(() => formatTotals({ totals: summary.value.stats.totalsByCurrency.slice(1) }));

const formattedAverage = computed(() => {
  const { average } = summary.value.stats;
  return average ? formatAmountByCurrencyCode(average.amount, average.currencyCode) : '–';
});

const formattedLastPayment = computed(() => {
  const { lastPaymentTime } = summary.value.stats;
  return lastPaymentTime ? format(lastPaymentTime, 'd MMM yyyy') : '–';
});

const driftKeypath = computed(() =>
  summary.value.drift?.direction === 'down'
    ? 'planned.subscriptions.linked.driftDown'
    : 'planned.subscriptions.linked.driftUp',
);

const formatBarTooltip = ({ bar }: { bar: LinkedPaymentsChartBar }): string => {
  const base = `${bar.monthLabel} · ${formatAmountByCurrencyCode(bar.amount, bar.currencyCode)}`;
  if (bar.currencyCode === bar.refCurrencyCode) return base;
  return `${base} ≈ ${formatAmountByCurrencyCode(bar.refAmount, bar.refCurrencyCode)}`;
};

/** Expenses read with a leading minus, matching how transaction rows render amounts. */
const formatRowAmount = ({ tx }: { tx: LinkedTransaction }): string =>
  formatAmountByCurrencyCode(
    tx.transactionType === TRANSACTION_TYPES.expense ? -tx.amount : tx.amount,
    tx.currencyCode,
  );

const MATCH_SOURCE_DOT_CLASSES: Record<string, string> = {
  [SUBSCRIPTION_MATCH_SOURCE.rule]: 'bg-success-text',
  [SUBSCRIPTION_MATCH_SOURCE.ai]: 'bg-primary',
  [SUBSCRIPTION_MATCH_SOURCE.manual]: 'border-muted-foreground border-[1.5px]',
};

const getMatchSourceDotClass = ({ source }: { source: string }): string =>
  MATCH_SOURCE_DOT_CLASSES[source] ?? MATCH_SOURCE_DOT_CLASSES[SUBSCRIPTION_MATCH_SOURCE.manual]!;
</script>

<template>
  <div class="@container/linked">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">
        {{ $t('planned.subscriptions.linkedTransactionsTitle') }}
        <span v-if="summary.payments.length" class="text-muted-foreground ml-1 text-sm font-normal">
          {{ summary.payments.length }}
        </span>
      </h2>
      <DesktopOnlyTooltip :content="$t('planned.subscriptions.suggestMatches')">
        <Button
          variant="outline"
          size="sm"
          :aria-label="$t('planned.subscriptions.suggestMatches')"
          @click="emit('suggest-matches')"
        >
          <SearchIcon class="size-4" />
          <span class="hidden @lg/linked:inline">{{ $t('planned.subscriptions.suggestMatches') }}</span>
        </Button>
      </DesktopOnlyTooltip>
    </div>

    <template v-if="summary.payments.length">
      <div
        class="bg-card border-border mb-3 flex flex-col rounded-lg border @lg/linked:gap-3 @lg/linked:border-0 @lg/linked:bg-transparent"
      >
        <div
          class="@lg/linked:border-border @lg/linked:bg-card flex flex-col p-3 @lg/linked:flex-row @lg/linked:overflow-hidden @lg/linked:rounded-lg @lg/linked:border @lg/linked:p-0"
        >
          <div class="@lg/linked:border-border @lg/linked:flex-1 @lg/linked:border-r @lg/linked:px-4 @lg/linked:py-2.5">
            <p class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              {{ $t('planned.subscriptions.linked.totalPaid') }}
            </p>
            <p class="text-amount text-xl @lg/linked:text-base">
              {{ primaryTotal }}
              <span v-if="secondaryTotals" class="text-muted-foreground text-xs font-medium">
                + {{ secondaryTotals }}
              </span>
            </p>
          </div>

          <div class="border-border/60 mt-2.5 flex gap-6 border-t pt-2.5 @lg/linked:contents">
            <div
              class="@lg/linked:border-border @lg/linked:flex-1 @lg/linked:border-r @lg/linked:px-4 @lg/linked:py-2.5"
            >
              <p class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                {{ $t('planned.subscriptions.linked.average') }}
              </p>
              <p class="text-amount text-sm @lg/linked:text-base">{{ formattedAverage }}</p>
            </div>
            <div class="@lg/linked:flex-1 @lg/linked:px-4 @lg/linked:py-2.5">
              <p class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                {{ $t('planned.subscriptions.linked.lastPayment') }}
              </p>
              <p class="text-amount text-sm @lg/linked:text-base">{{ formattedLastPayment }}</p>
            </div>
          </div>
        </div>

        <div
          class="border-border/60 @lg/linked:border-border @lg/linked:bg-card border-t px-3 pt-3 pb-2.5 @lg/linked:rounded-lg @lg/linked:border @lg/linked:p-3.5"
        >
          <div
            class="flex h-11 items-end gap-1 @lg/linked:h-14 @lg/linked:gap-1.5"
            role="img"
            :aria-label="$t('planned.subscriptions.linked.chartLabel')"
          >
            <ResponsiveTooltip v-for="bar in summary.chart" :key="bar.id" :delay-duration="100">
              <div
                class="max-w-9 min-w-2 flex-1 rounded-t-sm"
                :class="bar.isLatest ? 'bg-app-expense-color' : 'bg-app-expense-color/30'"
                :style="{ height: `${bar.heightPct}%` }"
              />
              <template #content>
                <span class="tabular-nums">{{ formatBarTooltip({ bar }) }}</span>
              </template>
            </ResponsiveTooltip>
          </div>

          <i18n-t v-if="summary.drift" :keypath="driftKeypath" tag="p" class="text-muted-foreground mt-2.5 text-xs">
            <template #percent>
              <span
                class="font-semibold"
                :class="summary.drift.direction === 'up' ? 'text-app-expense-color' : 'text-success-text'"
              >
                {{ summary.drift.percent }}
              </span>
            </template>
            <template #date>{{ format(summary.drift.firstPaymentTime, 'MMM yyyy') }}</template>
          </i18n-t>
        </div>
      </div>

      <div class="border-border bg-card overflow-hidden rounded-lg border">
        <div v-for="group in summary.yearGroups" :key="group.year" class="border-border border-b last:border-b-0">
          <div class="bg-background/50 flex items-center justify-between gap-3 px-2.5 py-1.5 @lg/linked:px-3.5">
            <span class="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              {{ group.year }} ·
              {{ $t('planned.subscriptions.linked.yearPayments', { count: group.payments.length }) }}
            </span>
            <span class="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
              {{ formatTotals({ totals: group.totalsByCurrency }) }}
            </span>
          </div>

          <div
            v-for="tx in group.payments"
            :key="tx.id"
            class="group/row border-border/50 hover:bg-muted/30 flex items-center gap-2.5 border-t px-2.5 py-2 @lg/linked:gap-3 @lg/linked:px-3.5"
          >
            <span class="text-muted-foreground w-12 shrink-0 font-mono text-[11px] tabular-nums @lg/linked:text-xs">
              {{ format(new Date(tx.time), 'd MMM') }}
            </span>
            <span
              class="size-2 shrink-0 rounded-full"
              :class="getMatchSourceDotClass({ source: tx.SubscriptionTransactions.matchSource })"
            />
            <span class="flex-1 truncate text-[13px] @lg/linked:text-sm">{{ tx.note }}</span>
            <span
              class="text-amount shrink-0 text-xs @lg/linked:text-sm"
              :class="
                tx.transactionType === TRANSACTION_TYPES.expense ? 'text-app-expense-color' : 'text-app-income-color'
              "
            >
              {{ formatRowAmount({ tx }) }}
            </span>
            <DesktopOnlyTooltip :content="$t('planned.subscriptions.unlinkTransaction')">
              <Button
                variant="ghost"
                size="icon-sm"
                class="shrink-0 opacity-45 transition-opacity group-hover/row:opacity-100 [@media(hover:hover)]:opacity-0"
                :disabled="isUnlinking"
                :aria-label="$t('planned.subscriptions.unlinkTransaction')"
                @click="handleUnlink({ transactionId: tx.id })"
              >
                <UnlinkIcon class="size-3.5" />
              </Button>
            </DesktopOnlyTooltip>
          </div>
        </div>
      </div>

      <div class="text-muted-foreground mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[11px]">
        <span class="inline-flex items-center gap-1.5">
          <span class="bg-success-text size-2 rounded-full" />
          {{ $t('planned.subscriptions.linked.legendRule') }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bg-primary size-2 rounded-full" />
          {{ $t('planned.subscriptions.linked.legendAi') }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="border-muted-foreground size-2 rounded-full border-[1.5px]" />
          {{ $t('planned.subscriptions.linked.legendManual') }}
        </span>
      </div>
    </template>

    <div v-else class="border-border rounded-lg border p-8 text-center">
      <LinkIcon class="text-muted-foreground mx-auto mb-2 size-8 opacity-50" />
      <p class="text-muted-foreground text-sm">{{ $t('planned.subscriptions.noLinkedTransactions') }}</p>
      <Button
        v-if="!hasMatchingRules"
        type="button"
        variant="outline"
        size="sm"
        class="mt-3"
        @click="emit('open-automation')"
      >
        <SettingsIcon class="size-4" />
        {{ $t('planned.subscriptions.addMatchingRules') }}
      </Button>
    </div>
  </div>
</template>
