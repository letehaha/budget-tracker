<script setup lang="ts">
import InvestmentTransactionForm from '@/components/forms/investment-transaction-form.vue';
import InvestmentTransactionsList from '@/components/investments/investment-transactions-list.vue';
import { Button } from '@/components/lib/ui/button';
import * as Dialog from '@/components/lib/ui/dialog';
import { useGetHoldingTransactions } from '@/composable/data-queries/investment-transactions';
import { useFormatCurrency } from '@/composable/formatters';
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
  ReceiptIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

const props = defineProps<{ holdings: HoldingModel[]; loading?: boolean; error?: boolean; portfolioId: number }>();

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
    // Fallback or default formatting if currency not found
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
  // Use the directly calculated latestPrice if available
  if (holding.latestPrice) {
    return Number(holding.latestPrice);
  }

  // Fallback: calculate from marketValue (preferred) or value and quantity
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

const getGainColorClass = (gainPercent: number) => {
  if (gainPercent > 0) return 'text-green-600';
  if (gainPercent < 0) return 'text-destructive-text';
  return 'text-gray-600';
};

const expandedHoldingId = ref<number | undefined>(undefined);
const currentPage = ref(1);
const limit = ref(10);

const { data: transactionsResponse, isFetching: isLoadingTransactions } = useGetHoldingTransactions(
  props.portfolioId,
  expandedHoldingId,
  currentPage,
  limit,
);

const handlePageChange = (newPage: number) => {
  currentPage.value = newPage;
};

const toggleExpand = (securityId: number) => {
  if (expandedHoldingId.value === securityId) {
    expandedHoldingId.value = undefined;
  } else {
    currentPage.value = 1;
    expandedHoldingId.value = securityId;
  }
};

const cellStyles = 'py-0.5';
const theadCellStyles = 'py-2';
</script>

<template>
  <div>
    <!-- Loading State with Skeleton -->
    <div v-if="loading" class="py-8">
      <div class="space-y-1">
        <!-- Skeleton Header -->
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
        <!-- Skeleton Rows -->
        <div v-for="i in 5" :key="i" class="flex items-center gap-4 py-3">
          <div class="bg-muted h-8 w-8 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-32 animate-pulse rounded"></div>
          <div class="bg-muted ml-auto h-4 w-16 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-16 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
          <!-- Unrealized Gain - double height for value + percentage -->
          <div class="flex h-10 flex-col justify-center gap-1">
            <div class="bg-muted h-4 w-20 animate-pulse rounded"></div>
            <div class="bg-muted h-3 w-16 animate-pulse rounded"></div>
          </div>
          <!-- Realized Gain - double height for value + percentage -->
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
        <AlertCircleIcon class="text-destructive size-6" />
      </div>
      <p class="text-destructive mb-2 font-medium">{{ $t('portfolioDetail.holdingsTable.loadError') }}</p>
      <p class="text-muted-foreground text-sm">{{ $t('portfolioDetail.holdingsTable.tryAgainLater') }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!holdings || holdings.length === 0" class="py-12 text-center">
      <div class="bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
        <PackageOpenIcon class="text-muted-foreground size-6" />
      </div>
      <p class="text-foreground mb-2 font-medium">{{ $t('portfolioDetail.holdingsTable.empty') }}</p>
      <p class="text-muted-foreground mb-4 text-sm">{{ $t('portfolioDetail.holdingsTable.emptyDescription') }}</p>
      <Button variant="outline" @click="openTransactionModal()">
        <PlusIcon class="mr-2 size-4" />
        {{ $t('portfolioDetail.holdingsTable.addFirstHolding') }}
      </Button>
    </div>

    <!-- Holdings Table -->
    <div v-else class="relative">
      <div>
        <table class="w-full">
          <thead class="bg-muted text-muted-foreground sticky top-[var(--header-height)] z-10">
            <tr class="text-xs font-medium tracking-wider uppercase">
              <th :class="[theadCellStyles, 'w-10 text-left']"></th>
              <th :class="[theadCellStyles, 'px-3 text-left']">
                <button
                  class="hover:text-foreground flex items-center gap-1 transition-colors"
                  @click="toggleSort('symbol')"
                >
                  {{ $t('portfolioDetail.holdingsTable.headers.symbol') }}
                  <ArrowUpIcon v-if="sortKey === 'symbol' && sortDir === 'asc'" class="size-3" />
                  <ArrowDownIcon v-if="sortKey === 'symbol' && sortDir === 'desc'" class="size-3" />
                </button>
              </th>
              <th :class="[theadCellStyles, 'px-3 text-left']">
                {{ $t('portfolioDetail.holdingsTable.headers.name') }}
              </th>
              <th :class="[theadCellStyles, 'px-3 text-right']">
                <button
                  class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                  @click="toggleSort('quantity')"
                >
                  {{ $t('portfolioDetail.holdingsTable.headers.shares') }}
                  <ArrowUpIcon v-if="sortKey === 'quantity' && sortDir === 'asc'" class="size-3" />
                  <ArrowDownIcon v-if="sortKey === 'quantity' && sortDir === 'desc'" class="size-3" />
                </button>
              </th>
              <th :class="[theadCellStyles, 'px-3 text-right']">
                {{ $t('portfolioDetail.holdingsTable.headers.price') }}
              </th>
              <th :class="[theadCellStyles, 'px-3 text-right']">
                <button
                  class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                  @click="toggleSort('avgCost')"
                >
                  {{ $t('portfolioDetail.holdingsTable.headers.avgCostPerShare') }}
                  <ArrowUpIcon v-if="sortKey === 'avgCost' && sortDir === 'asc'" class="size-3" />
                  <ArrowDownIcon v-if="sortKey === 'avgCost' && sortDir === 'desc'" class="size-3" />
                </button>
              </th>
              <th :class="[theadCellStyles, 'px-3 text-right']">
                <button
                  class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                  @click="toggleSort('totalCost')"
                >
                  {{ $t('portfolioDetail.holdingsTable.headers.totalCost') }}
                  <ArrowUpIcon v-if="sortKey === 'totalCost' && sortDir === 'asc'" class="size-3" />
                  <ArrowDownIcon v-if="sortKey === 'totalCost' && sortDir === 'desc'" class="size-3" />
                </button>
              </th>
              <th :class="[theadCellStyles, 'px-3 text-right']">
                <button
                  class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                  @click="toggleSort('value')"
                >
                  {{ $t('portfolioDetail.holdingsTable.headers.marketValue') }}
                  <ArrowUpIcon v-if="sortKey === 'value' && sortDir === 'asc'" class="size-3" />
                  <ArrowDownIcon v-if="sortKey === 'value' && sortDir === 'desc'" class="size-3" />
                </button>
              </th>
              <th :class="[theadCellStyles, 'px-3 text-right']">
                <button
                  class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                  @click="toggleSort('unrealizedGain')"
                >
                  {{ $t('portfolioDetail.holdingsTable.headers.unrealizedGain') }}
                  <ArrowUpIcon v-if="sortKey === 'unrealizedGain' && sortDir === 'asc'" class="size-3" />
                  <ArrowDownIcon v-if="sortKey === 'unrealizedGain' && sortDir === 'desc'" class="size-3" />
                </button>
              </th>
              <th :class="[theadCellStyles, 'px-3 text-right']">
                <button
                  class="hover:text-foreground flex w-full items-center justify-end gap-1 transition-colors"
                  @click="toggleSort('realizedGain')"
                >
                  {{ $t('portfolioDetail.holdingsTable.headers.realizedGain') }}
                  <ArrowUpIcon v-if="sortKey === 'realizedGain' && sortDir === 'asc'" class="size-3" />
                  <ArrowDownIcon v-if="sortKey === 'realizedGain' && sortDir === 'desc'" class="size-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody class="divide-border divide-y">
            <template v-for="h in sortedHoldings" :key="h.securityId">
              <tr class="hover:bg-muted/30 text-sm transition-colors">
                <td :class="[cellStyles, 'py-1']">
                  <Button variant="ghost" size="icon" class="size-8" @click="toggleExpand(h.securityId)">
                    <ChevronDownIcon v-if="expandedHoldingId === h.securityId" class="size-4" />
                    <ChevronRightIcon v-else class="size-4" />
                  </Button>
                </td>
                <td :class="[cellStyles, 'px-3 font-semibold']">{{ h.security?.symbol }}</td>
                <td :class="[cellStyles, 'text-muted-foreground max-w-[200px] truncate px-3']">
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
                  <div :class="getGainColorClass(getUnrealizedGain(h).percent)" class="tabular-nums">
                    <div class="font-semibold">{{ formatCurrency(getUnrealizedGain(h).value, h.currencyCode) }}</div>
                    <div class="text-xs">{{ getUnrealizedGain(h).percent.toFixed(2) }}%</div>
                  </div>
                </td>
                <td :class="[cellStyles, 'px-3 text-right']">
                  <div :class="getGainColorClass(getRealizedGain(h).percent)" class="tabular-nums">
                    <div class="font-semibold">{{ formatCurrency(getRealizedGain(h).value, h.currencyCode) }}</div>
                    <div class="text-xs">{{ getRealizedGain(h).percent.toFixed(2) }}%</div>
                  </div>
                </td>
              </tr>
              <!-- Expanded Transaction Details -->
              <tr v-if="expandedHoldingId === h.securityId" class="bg-muted/20">
                <td colspan="10" class="p-0">
                  <div class="border-primary/20 ml-4 border-l-2">
                    <div v-if="isLoadingTransactions && !transactionsResponse" class="p-6 text-center">
                      <div
                        class="border-primary/20 mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-t-transparent"
                      ></div>
                      <p class="text-muted-foreground text-sm">
                        {{ $t('portfolioDetail.holdingsTable.transactions.loading') }}
                      </p>
                    </div>
                    <InvestmentTransactionsList
                      v-else-if="transactionsResponse?.transactions?.length"
                      :transactions="transactionsResponse.transactions"
                      :total="transactionsResponse.total"
                      :limit="transactionsResponse.limit"
                      :page="currentPage"
                      @page-change="handlePageChange"
                      @add-transaction="openTransactionModal(h)"
                    />
                    <div v-else class="p-6 text-center">
                      <div class="bg-muted mx-auto mb-3 flex size-10 items-center justify-center rounded-full">
                        <ReceiptIcon class="text-muted-foreground size-5" />
                      </div>
                      <p class="text-muted-foreground mb-3 text-sm">
                        {{ $t('portfolioDetail.holdingsTable.transactions.empty') }}
                      </p>
                      <Button variant="outline" size="sm" @click="openTransactionModal(h)">
                        <PlusIcon class="mr-2 size-4" />
                        {{ $t('portfolioDetail.holdingsTable.transactions.addFirstButton') }}
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <Dialog.Dialog v-model:open="isTransactionModalOpen">
      <Dialog.DialogContent class="sm:max-w-[425px]">
        <Dialog.DialogHeader>
          <Dialog.DialogTitle>{{ $t('portfolioDetail.holdingsTable.addTransactionDialog.title') }}</Dialog.DialogTitle>
          <Dialog.DialogDescription>
            {{ $t('portfolioDetail.holdingsTable.addTransactionDialog.description') }}
          </Dialog.DialogDescription>
        </Dialog.DialogHeader>
        <InvestmentTransactionForm
          class="mt-4"
          :portfolio-id="portfolioId"
          :securities="
            holdings.map((h) => ({
              value: String(h.securityId),
              label: h.security?.name ? `${h.security.name} (${h.security.symbol})` : (h.security?.symbol ?? 'Unknown'),
            }))
          "
          :security-id="selectedHolding?.securityId ? String(selectedHolding.securityId) : undefined"
          @success="isTransactionModalOpen = false"
          @cancel="isTransactionModalOpen = false"
        />
      </Dialog.DialogContent>
    </Dialog.Dialog>
  </div>
</template>
