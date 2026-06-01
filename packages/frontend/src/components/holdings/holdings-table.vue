<script setup lang="ts">
import PrecisionNumber from '@/components/common/precision-number.vue';
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
import { ASSET_CLASS, type HoldingModel } from '@bt/shared/types/investments';
import {
  AlertCircleIcon,
  ArchiveIcon,
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
import {
  type HoldingSortKey,
  getAverageCost,
  getPrice,
  getTotalCost,
  groupHoldings,
  sortHoldings,
} from './utils/holding-display';

// Crypto trades in much smaller units than typical stock fractional shares, so
// it needs more visible precision before falling back to a hover-reveal.
const QUANTITY_DECIMALS = { crypto: 4, default: 2 } as const;
const decimalsForAssetClass = (assetClass: ASSET_CLASS | undefined) =>
  assetClass === ASSET_CLASS.crypto ? QUANTITY_DECIMALS.crypto : QUANTITY_DECIMALS.default;

const props = defineProps<{
  holdings: HoldingModel[];
  loading?: boolean;
  error?: boolean;
  portfolioId: string;
  // When the user is filtering via search, closed positions are shown inline
  // alongside active ones (no collapsible section).
  isFiltering?: boolean;
}>();
const emit = defineEmits<{ (e: 'addSymbol'): void; (e: 'importTransactions'): void }>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isTransactionModalOpen = ref(false);
const selectedHolding = ref<HoldingModel | null>(null);

const openTransactionModal = (holding: HoldingModel | null = null) => {
  selectedHolding.value = holding;
  isTransactionModalOpen.value = true;
};

const sortKey = ref<HoldingSortKey>('totalCost');
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

const toggleSort = (key: HoldingSortKey) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
};

// Collapsible "Closed positions" section, collapsed by default.
const closedExpanded = ref(false);

const groupedHoldings = computed(() =>
  groupHoldings({ holdings: props.holdings ?? [], sortKey: sortKey.value, sortDir: sortDir.value }),
);

type DisplayRow = { kind: 'holding'; holding: HoldingModel } | { kind: 'closedToggle'; count: number };

/**
 * Flat list of rows to render. While filtering we show every match in one
 * combined sorted list; otherwise active positions come first, followed by a
 * collapsible "Closed positions" toggle and (when expanded) the closed ones.
 */
const displayRows = computed<DisplayRow[]>(() => {
  if (props.isFiltering) {
    return sortHoldings({ holdings: props.holdings ?? [], sortKey: sortKey.value, sortDir: sortDir.value }).map(
      (holding) => ({ kind: 'holding', holding }),
    );
  }

  const { active, closed } = groupedHoldings.value;
  const rows: DisplayRow[] = active.map((holding) => ({ kind: 'holding', holding }));

  if (closed.length > 0) {
    rows.push({ kind: 'closedToggle', count: closed.length });
    if (closedExpanded.value) {
      rows.push(...closed.map((holding) => ({ kind: 'holding', holding }) as const));
    }
  }

  return rows;
});

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
          <template
            v-for="row in displayRows"
            :key="row.kind === 'closedToggle' ? 'closed-positions-toggle' : row.holding.securityId"
          >
            <!-- Inline collapsible "Closed positions" section header -->
            <tr
              v-if="row.kind === 'closedToggle'"
              class="bg-muted/40 hover:bg-muted/70 cursor-pointer text-sm transition-colors"
              @click="closedExpanded = !closedExpanded"
            >
              <td :class="[cellStyles, 'py-1']">
                <Button variant="ghost" size="icon" class="size-8" @click.stop="closedExpanded = !closedExpanded">
                  <ChevronDownIcon v-if="closedExpanded" class="size-4" />
                  <ChevronRightIcon v-else class="size-4" />
                </Button>
              </td>
              <td colspan="10" :class="[cellStyles, 'px-3']">
                <div class="text-muted-foreground flex items-center gap-2 font-medium">
                  <ArchiveIcon class="size-4" />
                  {{ $t('portfolioDetail.holdingsTable.closedPositions', { count: row.count }) }}
                </div>
              </td>
            </tr>
            <template v-else>
              <tr class="hover:bg-muted/30 text-sm transition-colors">
                <td :class="[cellStyles, 'py-1']">
                  <Button variant="ghost" size="icon" class="size-8" @click="toggleExpand(row.holding.securityId)">
                    <ChevronDownIcon v-if="isExpanded(row.holding.securityId)" class="size-4" />
                    <ChevronRightIcon v-else class="size-4" />
                  </Button>
                </td>
                <td :class="[cellStyles, 'px-3 font-semibold']">
                  <div class="flex items-center gap-2">
                    <SecurityLogo v-if="row.holding.security" :security="row.holding.security" />
                    <span>{{ row.holding.security?.symbol }}</span>
                  </div>
                </td>
                <td :class="[cellStyles, 'text-muted-foreground max-w-50 truncate px-3']">
                  {{ row.holding.security?.name }}
                </td>
                <td :class="[cellStyles, 'px-3 text-right tabular-nums']">
                  <PrecisionNumber
                    :value="row.holding.quantity"
                    :max-decimals="decimalsForAssetClass(row.holding.security?.assetClass)"
                  />
                </td>
                <td :class="[cellStyles, 'px-3 text-right tabular-nums']">
                  {{ formatCurrency(getPrice(row.holding), row.holding.currencyCode) }}
                </td>
                <td :class="[cellStyles, 'text-muted-foreground px-3 text-right tabular-nums']">
                  {{ formatCurrency(getAverageCost(row.holding), row.holding.currencyCode) }}
                </td>
                <td :class="[cellStyles, 'px-3 text-right tabular-nums']">
                  {{ formatCurrency(getTotalCost(row.holding), row.holding.currencyCode) }}
                </td>
                <td :class="[cellStyles, 'px-3 text-right font-medium tabular-nums']">
                  {{ formatCurrency(Number(row.holding.marketValue || 0), row.holding.currencyCode) }}
                </td>
                <td :class="[cellStyles, 'px-3 text-right']">
                  <div
                    :class="getGainColorClass({ gainValue: getUnrealizedGain(row.holding).value })"
                    class="tabular-nums"
                  >
                    <div class="font-semibold">
                      {{ formatCurrency(getUnrealizedGain(row.holding).value, row.holding.currencyCode) }}
                    </div>
                    <div class="text-xs">{{ getUnrealizedGain(row.holding).percent.toFixed(2) }}%</div>
                  </div>
                </td>
                <td :class="[cellStyles, 'px-3 text-right']">
                  <div
                    :class="getGainColorClass({ gainValue: getRealizedGain(row.holding).value })"
                    class="tabular-nums"
                  >
                    <div class="font-semibold">
                      {{ formatCurrency(getRealizedGain(row.holding).value, row.holding.currencyCode) }}
                    </div>
                    <div class="text-xs">{{ getRealizedGain(row.holding).percent.toFixed(2) }}%</div>
                  </div>
                </td>
                <td :class="[cellStyles, 'py-1 pr-2 text-right']">
                  <DesktopOnlyTooltip :content="$t('portfolioDetail.holdingsTable.deleteHolding.ariaLabel')">
                    <Button
                      variant="ghost-destructive"
                      size="icon"
                      class="size-8"
                      :aria-label="$t('portfolioDetail.holdingsTable.deleteHolding.ariaLabel')"
                      @click="openDeleteConfirm(row.holding)"
                    >
                      <Trash2Icon class="size-4" />
                    </Button>
                  </DesktopOnlyTooltip>
                </td>
              </tr>
              <!-- Expanded transactions section -->
              <tr v-if="isExpanded(row.holding.securityId)" class="bg-muted/20">
                <td colspan="11" class="p-0">
                  <HoldingTransactionsSection
                    :portfolio-id="portfolioId"
                    :security-id="row.holding.securityId"
                    @add-transaction="openTransactionModal(row.holding)"
                  />
                </td>
              </tr>
            </template>
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
