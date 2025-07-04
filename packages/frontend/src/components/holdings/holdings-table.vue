<script setup lang="ts">
import InvestmentTransactionForm from '@/components/forms/investment-transaction-form.vue';
import InvestmentTransactionsList from '@/components/investments/investment-transactions-list.vue';
import { Button } from '@/components/lib/ui/button';
import * as Dialog from '@/components/lib/ui/dialog';
import { useGetHoldingTransactions } from '@/composable/data-queries/investment-transactions';
import type { HoldingModel } from '@bt/shared/types/investments';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const props = defineProps<{ holdings: HoldingModel[]; loading?: boolean; error?: boolean; portfolioId: number }>();

const isTransactionModalOpen = ref(false);
const selectedHolding = ref<HoldingModel | null>(null);

const openTransactionModal = (holding: HoldingModel | null = null) => {
  selectedHolding.value = holding;
  isTransactionModalOpen.value = true;
};

const sortKey = ref<'symbol' | 'quantity' | 'value'>('value');
const sortDir = ref<'asc' | 'desc'>('asc');

const toggleSort = (key: 'symbol' | 'quantity' | 'value') => {
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
        av = Number(a.value);
        bv = Number(b.value);
        break;
    }
    if (typeof av === 'string') av = av.toLocaleLowerCase();
    if (typeof bv === 'string') bv = bv.toLocaleLowerCase();
    return sortDir.value === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
  });
});

const getPrice = (holding: HoldingModel) => {
  const quantity = Number(holding.quantity);
  const value = Number(holding.value);
  return quantity > 0 && value > 0 ? value / quantity : 0;
};

const expandedHoldingId = ref<number | null>(null);
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
    expandedHoldingId.value = null;
  } else {
    currentPage.value = 1;
    expandedHoldingId.value = securityId;
  }
};
</script>

<template>
  <div>
    <div v-if="loading" class="text-center">Loading...</div>
    <div v-else-if="error" class="text-center text-red-500">Could not load holdings</div>
    <div v-else-if="!holdings || holdings.length === 0" class="text-center">No holdings yet</div>
    <div v-else>
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-muted/50 text-muted-foreground">
          <tr>
            <th class="px-4 py-2 w-12 text-left"></th>
            <th class="px-4 py-2 text-left">
              <button class="flex gap-1 items-center" @click="toggleSort('symbol')">
                Symbol
                <ArrowUpIcon v-if="sortKey === 'symbol' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'symbol' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th class="px-4 py-2 text-left">Name</th>
            <th class="px-4 py-2 text-right">
              <button class="flex gap-1 justify-end items-center" @click="toggleSort('quantity')">
                Shares
                <ArrowUpIcon v-if="sortKey === 'quantity' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'quantity' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
            <th class="px-4 py-2 text-right">Price</th>
            <th class="px-4 py-2 text-right">
              <button class="flex gap-1 justify-end items-center" @click="toggleSort('value')">
                Market Value
                <ArrowUpIcon v-if="sortKey === 'value' && sortDir === 'asc'" class="size-3" />
                <ArrowDownIcon v-if="sortKey === 'value' && sortDir === 'desc'" class="size-3" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <template v-for="h in sortedHoldings" :key="h.securityId">
            <tr class="hover:bg-muted/20">
              <td class="px-4 py-2">
                <Button variant="ghost" size="icon" @click="toggleExpand(h.securityId)">
                  <ChevronDownIcon v-if="expandedHoldingId === h.securityId" class="size-4" />
                  <ChevronRightIcon v-else class="size-4" />
                </Button>
              </td>
              <td class="px-4 py-2 font-medium">{{ h.security?.symbol }}</td>
              <td class="max-w-[150px] truncate px-4 py-2">{{ h.security?.name }}</td>
              <td class="px-4 py-2 text-right">{{ Number(h.quantity).toLocaleString() }}</td>
              <td class="px-4 py-2 text-right">{{ getPrice(h).toFixed(2) }}</td>
              <td class="px-4 py-2 text-right">{{ Number(h.value).toLocaleString() }}</td>
            </tr>
            <tr v-if="expandedHoldingId === h.securityId">
              <td colspan="6">
                <div
                  v-if="isLoadingTransactions && !transactionsResponse"
                  class="p-4 text-center text-muted-foreground"
                >
                  Loading transactions…
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
                <div v-else class="p-4 text-center text-muted-foreground">
                  No transactions found.
                  <Button variant="secondary" @click="openTransactionModal(h)"> Add first Tx </Button>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <Dialog.Dialog v-model:open="isTransactionModalOpen">
      <Dialog.DialogContent class="sm:max-w-[425px]">
        <Dialog.DialogHeader>
          <Dialog.DialogTitle>Add Transaction</Dialog.DialogTitle>
          <Dialog.DialogDescription> Add a new transaction to your portfolio. </Dialog.DialogDescription>
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
        />
      </Dialog.DialogContent>
    </Dialog.Dialog>
  </div>
</template>
