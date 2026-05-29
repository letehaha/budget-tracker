<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InvestmentTransactionForm from '@/components/forms/investment-transaction-form.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useDeleteHolding } from '@/composable/data-queries/holdings';
import { useFormatCurrency } from '@/composable/formatters';
import { getGainColorClass } from '@/composable/gain-color';
import { getApiErrorMessage } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { useCurrenciesStore } from '@/stores/currencies';
import type { HoldingModel } from '@bt/shared/types/investments';
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PackageOpenIcon,
  PlusIcon,
  Trash2Icon,
} from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import SecurityLogo from '@/components/common/security-logo.vue';

import HoldingTransactionsSection from './holding-transactions-section.vue';
import { useHoldingRowExpansion } from './composables/use-holding-row-expansion';

const props = defineProps<{ holdings: HoldingModel[]; loading?: boolean; error?: boolean; portfolioId: string }>();
const emit = defineEmits<{ (e: 'addSymbol'): void; (e: 'importTransactions'): void }>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isTransactionModalOpen = ref(false);
const selectedHolding = ref<HoldingModel | null>(null);

const openTransactionModal = (holding: HoldingModel | null = null) => {
  selectedHolding.value = holding;
  isTransactionModalOpen.value = true;
};

const sortKey = ref<'symbol' | 'quantity' | 'value' | 'avgCost' | 'totalCost' | 'unrealizedGain' | 'realizedGain'>(
  'totalCost',
);
const sortDir = ref<'asc' | 'desc'>('desc');

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { currencies } = storeToRefs(useCurrenciesStore());
const formatCurrency = (amount: number, currencyCode: string) => {
  const userCurrency = currencies.value.find((c) => c.currency?.code === currencyCode.toUpperCase());
  if (!userCurrency) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return formatAmountByCurrencyCode(amount, userCurrency.currencyCode);
};

const toggleSort = (
  key: 'symbol' | 'quantity' | 'value' | 'avgCost' | 'totalCost' | 'unrealizedGain' | 'realizedGain',
) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
};

const sortedHoldings = computed(() => {
  if (!props.holdings) return [];
  return [...props.holdings].sort((a, b) => {
    let av: string | number;
    let bv: string | number;

    switch (sortKey.value) {
      case 'symbol':
        av = a.security?.symbol ?? '';
        bv = b.security?.symbol ?? '';
        break;
      case 'quantity':
        av = Number(a.quantity);
        bv = Number(b.quantity);
        break;
      case 'value':
        av = Number(a.marketValue || 0);
        bv = Number(b.marketValue || 0);
        break;
      case 'avgCost':
        av = getAverageCost(a);
        bv = getAverageCost(b);
        break;
      case 'totalCost':
        av = getTotalCost(a);
        bv = getTotalCost(b);
        break;
      case 'unrealizedGain':
        av = Number(a.unrealizedGainValue || 0);
        bv = Number(b.unrealizedGainValue || 0);
        break;
      case 'realizedGain':
        av = Number(a.realizedGainValue || 0);
        bv = Number(b.realizedGainValue || 0);
        break;
    }
    if (typeof av === 'string') av = av.toLocaleLowerCase();
    if (typeof bv === 'string') bv = bv.toLocaleLowerCase();
    return sortDir.value === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
  });
});

const getPrice = (holding: HoldingModel) => {
  if (holding.latestPrice) {
    return Number(holding.latestPrice);
  }
  const quantity = Number(holding.quantity);
  const marketValue = Number(holding.marketValue || 0);
  return quantity > 0 && marketValue > 0 ? marketValue / quantity : 0;
};

const getAverageCost = (holding: HoldingModel) => {
  const quantity = Number(holding.quantity);
  const costBasis = Number(holding.costBasis);
  return quantity > 0 && costBasis > 0 ? costBasis / quantity : 0;
};

const getTotalCost = (holding: HoldingModel) => {
  return Number(holding.costBasis);
};

const getUnrealizedGain = (holding: HoldingModel) => {
  return {
    value: Number(holding.unrealizedGainValue || 0),
    percent: Number(holding.unrealizedGainPercent || 0),
  };
};

const getRealizedGain = (holding: HoldingModel) => {
  return {
    value: Number(holding.realizedGainValue || 0),
    percent: Number(holding.realizedGainPercent || 0),
  };
};

const { isExpanded, toggleExpand, collapseIfMatches } = useHoldingRowExpansion();

// Delete holding flow
const deleteHoldingMutation = useDeleteHolding();
const deleteConfirmOpen = ref(false);
const holdingPendingDelete = ref<HoldingModel | null>(null);

const openDeleteConfirm = (holding: HoldingModel) => {
  holdingPendingDelete.value = holding;
  deleteConfirmOpen.value = true;
};

const confirmDeleteHolding = async () => {
  const target = holdingPendingDelete.value;
  if (!target) return;
  try {
    await deleteHoldingMutation.mutateAsync({
      portfolioId: props.portfolioId,
      securityId: target.securityId,
      force: true,
    });
    addSuccessNotification(t('portfolioDetail.holdingsTable.deleteHolding.success'));
    collapseIfMatches(target.securityId);
  } catch (err) {
    const message = getApiErrorMessage({
      e: err,
      t,
      conflictKey: 'portfolioDetail.holdingsTable.deleteHolding.error',
      fallbackKey: 'portfolioDetail.holdingsTable.deleteHolding.error',
    });
    addErrorNotification(message);
    captureException({
      error: err,
      context: { source: 'confirmDeleteHolding', portfolioId: props.portfolioId, securityId: target.securityId },
    });
  } finally {
    deleteConfirmOpen.value = false;
    holdingPendingDelete.value = null;
  }
};

const cellStyles = 'py-0.5';
const theadCellStyles = 'py-2';
const theadBgStyles = 'bg-muted';
</script>

<template>
  <div>
    <!-- Loading State with Skeleton -->
    <div v-if="loading" class="py-8">
      <div class="space-y-1">
        <div class="flex items-center gap-4 border-b pb-2">
          <div class="h-4 w-8"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-32 animate-pulse rounded"></div>
          <div class="bg-muted ml-auto h-4 w-16 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-16 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-8 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-8 w-20 animate-pulse rounded"></div>
        </div>
        <div v-for="i in 5" :key="i" class="flex items-center gap-4 py-3">
          <div class="bg-muted h-8 w-8 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-32 animate-pulse rounded"></div>
          <div class="bg-muted ml-auto h-4 w-16 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-16 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="flex h-10 flex-col justify-center gap-1">
            <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
            <div class="bg-muted h-3 w-16 animate-pulse rounded"></div>
          </div>
          <div class="flex h-10 flex-col justify-center gap-1">
            <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
            <div class="bg-muted h-3 w-16 animate-pulse rounded"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="py-12 text-center">
      <div class="bg-destructive/10 mx-auto mb-3 flex size-12 items-center justify-center rounded-full">
        <AlertCircleIcon class="text-destructive-text size-6" />
      </div>
      <p class="text-destructive-text mb-2 font-medium">{{ $t('portfolioDetail.holdingsTable.loadError') }}</p>
      <p class="text-muted-foreground text-sm">{{ $t('portfolioDetail.holdingsTable.tryAgainLater') }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!holdings || holdings.length === 0" class="py-12 text-center">
      <div class="bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
        <PackageOpenIcon class="text-muted-foreground size-6" />
      </div>
      <p class="text-foreground mb-2 font-medium">{{ $t('portfolioDetail.holdingsTable.empty') }}</p>
      <p class="text-muted-foreground mb-4 text-sm">{{ $t('portfolioDetail.holdingsTable.emptyDescription') }}</p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" @click="emit('addSymbol')">
          <PlusIcon class="mr-2 size-4" />
          {{ $t('portfolioDetail.holdingsTable.addFirstHolding') }}
        </Button>
        <Button variant="ghost" @click="emit('importTransactions')">
          {{ $t('portfolioDetail.holdingsTable.importTransactions') }}
        </Button>
      </div>
    </div>

    <!-- Holdings Table -->
    <div v-else class="relative overflow-x-auto">
      <table class="w-full min-w-235">
        <thead class="text-muted-foreground">
          <tr class="text-xs font-medium tracking-wider uppercase">
            <th :class="[theadCellStyles, theadBgStyles, 'w-10 text-left']"></th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-left']">
              <button
                class="hover:text-foreground flex items-center gap-1 transition-colors"
                @click="toggleSort('symbol')"
              >
                {{ $t('portfolioDetail.holdingsTable.headers.symbol') }}
                <ArrowUpIcon v-if="sortKey === 'symbol' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'symbol' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-left']">
              {{ $t('portfolioDetail.holdingsTable.headers.name') }}
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-right']">
              <button
                class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                @click="toggleSort('quantity')"
              >
                {{ $t('portfolioDetail.holdingsTable.headers.shares') }}
                <ArrowUpIcon v-if="sortKey === 'quantity' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'quantity' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-right']">
              {{ $t('portfolioDetail.holdingsTable.headers.price') }}
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-right']">
              <button
                class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                @click="toggleSort('avgCost')"
              >
                {{ $t('portfolioDetail.holdingsTable.headers.avgCostPerShare') }}
                <ArrowUpIcon v-if="sortKey === 'avgCost' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'avgCost' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-right']">
              <button
                class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                @click="toggleSort('totalCost')"
              >
                {{ $t('portfolioDetail.holdingsTable.headers.totalCost') }}
                <ArrowUpIcon v-if="sortKey === 'totalCost' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'totalCost' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-right']">
              <button
                class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                @click="toggleSort('value')"
              >
                {{ $t('portfolioDetail.holdingsTable.headers.marketValue') }}
                <ArrowUpIcon v-if="sortKey === 'value' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'value' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-right']">
              <button
                class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                @click="toggleSort('unrealizedGain')"
              >
                {{ $t('portfolioDetail.holdingsTable.headers.unrealizedGain') }}
                <ArrowUpIcon v-if="sortKey === 'unrealizedGain' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'unrealizedGain' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'px-3 text-right']">
              <button
                class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                @click="toggleSort('realizedGain')"
              >
                {{ $t('portfolioDetail.holdingsTable.headers.realizedGain') }}
                <ArrowUpIcon v-if="sortKey === 'realizedGain' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'realizedGain' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th :class="[theadCellStyles, theadBgStyles, 'w-10 text-right']"></th>
          </tr>
        </thead>
        <tbody class="divide-border divide-y">
          <template v-for="h in sortedHoldings" :key="h.securityId">
            <tr class="hover:bg-muted/30 text-sm transition-colors">
              <td :class="[cellStyles, 'py-1']">
                <Button variant="ghost" size="icon" class="size-8" @click="toggleExpand(h.securityId)">
                  <ChevronDownIcon v-if="isExpanded(h.securityId)" class="size-4" />
                  <ChevronRightIcon v-else class="size-4" />
                </Button>
              </td>
              <td :class="[cellStyles, 'px-3 font-semibold']">
                <div class="flex items-center gap-2">
                  <SecurityLogo v-if="h.security" :security="h.security" />
                  <span>{{ h.security?.symbol }}</span>
                </div>
              </td>
              <td :class="[cellStyles, 'text-muted-foreground max-w-50 truncate px-3']">
                {{ h.security?.name }}
              </td>
              <td :class="[cellStyles, 'px-3 text-right tabular-nums']">{{ Number(h.quantity).toLocaleString() }}</td>
              <td :class="[cellStyles, 'px-3 text-right tabular-nums']">
                {{ formatCurrency(getPrice(h), h.currencyCode) }}
              </td>
              <td :class="[cellStyles, 'text-muted-foreground px-3 text-right tabular-nums']">
                {{ formatCurrency(getAverageCost(h), h.currencyCode) }}
              </td>
              <td :class="[cellStyles, 'px-3 text-right tabular-nums']">
                {{ formatCurrency(getTotalCost(h), h.currencyCode) }}
              </td>
              <td :class="[cellStyles, 'px-3 text-right font-medium tabular-nums']">
                {{ formatCurrency(Number(h.marketValue || 0), h.currencyCode) }}
              </td>
              <td :class="[cellStyles, 'px-3 text-right']">
                <div :class="getGainColorClass({ gainValue: getUnrealizedGain(h).value })" class="tabular-nums">
                  <div class="font-semibold">{{ formatCurrency(getUnrealizedGain(h).value, h.currencyCode) }}</div>
                  <div class="text-xs">{{ getUnrealizedGain(h).percent.toFixed(2) }}%</div>
                </div>
              </td>
              <td :class="[cellStyles, 'px-3 text-right']">
                <div :class="getGainColorClass({ gainValue: getRealizedGain(h).value })" class="tabular-nums">
                  <div class="font-semibold">{{ formatCurrency(getRealizedGain(h).value, h.currencyCode) }}</div>
                  <div class="text-xs">{{ getRealizedGain(h).percent.toFixed(2) }}%</div>
                </div>
              </td>
              <td :class="[cellStyles, 'py-1 pr-2 text-right']">
                <DesktopOnlyTooltip :content="$t('portfolioDetail.holdingsTable.deleteHolding.ariaLabel')">
                  <Button
                    variant="ghost-destructive"
                    size="icon"
                    class="size-8"
                    :aria-label="$t('portfolioDetail.holdingsTable.deleteHolding.ariaLabel')"
                    @click="openDeleteConfirm(h)"
                  >
                    <Trash2Icon class="size-4" />
                  </Button>
                </DesktopOnlyTooltip>
              </td>
            </tr>
            <!-- Expanded transactions section -->
            <tr v-if="isExpanded(h.securityId)" class="bg-muted/20">
              <td colspan="11" class="p-0">
                <HoldingTransactionsSection
                  :portfolio-id="portfolioId"
                  :security-id="h.securityId"
                  @add-transaction="openTransactionModal(h)"
                />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <ResponsiveDialog v-model:open="isTransactionModalOpen" dialog-content-class="sm:max-w-106.25">
      <template #title>{{ $t('portfolioDetail.holdingsTable.addTransactionDialog.title') }}</template>
      <template #description>
        {{ $t('portfolioDetail.holdingsTable.addTransactionDialog.description') }}
      </template>
      <InvestmentTransactionForm
        :portfolio-id="portfolioId"
        :securities="
          holdings.map((hh) => ({
            value: String(hh.securityId),
            label: hh.security?.name
              ? `${hh.security.name} (${hh.security.symbol})`
              : (hh.security?.symbol ?? 'Unknown'),
          }))
        "
        :security-id="selectedHolding?.securityId ? String(selectedHolding.securityId) : undefined"
        @success="isTransactionModalOpen = false"
        @cancel="isTransactionModalOpen = false"
      />
    </ResponsiveDialog>

    <ResponsiveAlertDialog
      v-model:open="deleteConfirmOpen"
      :confirm-label="$t('portfolioDetail.holdingsTable.deleteHolding.confirmLabel')"
      confirm-variant="destructive"
      :confirm-disabled="deleteHoldingMutation.isPending.value"
      @confirm="confirmDeleteHolding"
    >
      <template #title>{{ $t('portfolioDetail.holdingsTable.deleteHolding.title') }}</template>
      <template #description>
        <i18n-t keypath="portfolioDetail.holdingsTable.deleteHolding.description" tag="span">
          <template #symbol>
            <strong>{{ holdingPendingDelete?.security?.symbol ?? '' }}</strong>
          </template>
        </i18n-t>
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
