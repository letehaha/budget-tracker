<script setup lang="ts">
import DeleteInvestmentTransactionDialog from '@/components/dialogs/delete-investment-transaction-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { useFormatCurrency } from '@/composable/formatters';
import type { InvestmentTransactionModel } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { format } from 'date-fns';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { ref } from 'vue';

const props = defineProps<{
  transactions: InvestmentTransactionModel[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}>();

defineEmits<{ (e: 'add-transaction'): void }>();

const { formatAmountByCurrencyCode } = useFormatCurrency();
const formatDate = (date: string) => format(new Date(date), 'dd/MM/yyyy');

const getCategoryClasses = (category: INVESTMENT_TRANSACTION_CATEGORY) => {
  const map: Record<INVESTMENT_TRANSACTION_CATEGORY, string> = {
    [INVESTMENT_TRANSACTION_CATEGORY.buy]: 'bg-green-500/10 text-green-600',
    [INVESTMENT_TRANSACTION_CATEGORY.sell]: 'bg-red-500/10 text-red-600',
    [INVESTMENT_TRANSACTION_CATEGORY.dividend]: 'bg-blue-500/10 text-blue-600',
    [INVESTMENT_TRANSACTION_CATEGORY.transfer]: 'bg-amber-500/10 text-amber-600',
    [INVESTMENT_TRANSACTION_CATEGORY.tax]: 'bg-slate-500/10 text-slate-600',
    [INVESTMENT_TRANSACTION_CATEGORY.fee]: 'bg-orange-500/10 text-orange-600',
    [INVESTMENT_TRANSACTION_CATEGORY.cancel]: 'bg-gray-500/10 text-gray-600',
    [INVESTMENT_TRANSACTION_CATEGORY.other]: 'bg-slate-500/10 text-slate-600',
  };
  return map[category] ?? 'bg-slate-500/10 text-slate-600';
};

// Reactive refs the composable expects
import { computed, toRef } from 'vue';
const itemsRef = computed(() => props.transactions);
const hasNextPageRef = toRef(() => props.hasNextPage);
const isFetchingNextPageRef = toRef(() => props.isFetchingNextPage);

const parentRef = ref<HTMLElement | null>(null);

const { virtualRows, totalSize } = useVirtualizedInfiniteScroll<InvestmentTransactionModel>({
  items: itemsRef,
  hasNextPage: hasNextPageRef,
  isFetchingNextPage: isFetchingNextPageRef,
  fetchNextPage: async () => props.fetchNextPage(),
  parentRef,
  estimateSize: () => 36,
  overscan: 8,
  getItemKey: (index) => itemsRef.value[index]?.id ?? index,
});
</script>

<template>
  <div class="p-4">
    <div class="mb-3 flex items-center justify-between">
      <h4 class="text-sm font-semibold">{{ $t('portfolioDetail.transactionsList.title') }}</h4>
      <UiButton variant="outline" size="sm" @click="$emit('add-transaction')">
        <PlusIcon class="mr-1.5 size-3.5" />
        {{ $t('portfolioDetail.transactionsList.addButton') }}
      </UiButton>
    </div>

    <!-- Sticky-header grid table; virtualized rows below. Max height capped to viewport. -->
    <div class="bg-muted text-muted-foreground rounded-t-md text-xs font-medium tracking-wider uppercase">
      <div class="grid items-center gap-2 px-3 py-2" style="grid-template-columns: 6rem 7rem 1fr 1fr 1fr 1fr 2.25rem">
        <div class="text-left">{{ $t('portfolioDetail.transactionsList.headers.date') }}</div>
        <div class="text-left">{{ $t('portfolioDetail.transactionsList.headers.type') }}</div>
        <div class="text-right">{{ $t('portfolioDetail.transactionsList.headers.quantity') }}</div>
        <div class="text-right">{{ $t('portfolioDetail.transactionsList.headers.price') }}</div>
        <div class="text-right">{{ $t('portfolioDetail.transactionsList.headers.fees') }}</div>
        <div class="text-right">{{ $t('portfolioDetail.transactionsList.headers.amount') }}</div>
        <div></div>
      </div>
    </div>

    <div
      ref="parentRef"
      class="divide-border relative max-h-[min(60vh,540px)] divide-y overflow-y-auto rounded-b-md border-x border-b text-sm"
    >
      <div :style="{ height: `${totalSize}px`, position: 'relative', width: '100%' }">
        <div
          v-for="virtualRow in virtualRows"
          :key="String(virtualRow.key)"
          class="absolute top-0 left-0 w-full"
          :style="{ transform: `translateY(${virtualRow.start}px)` }"
        >
          <template v-if="transactions[virtualRow.index]">
            <div
              class="hover:bg-muted/30 grid items-center gap-2 px-3 py-1.5 transition-colors"
              style="grid-template-columns: 6rem 7rem 1fr 1fr 1fr 1fr 2.25rem"
            >
              <div class="tabular-nums">{{ formatDate(transactions[virtualRow.index]!.date) }}</div>
              <div>
                <span
                  :class="getCategoryClasses(transactions[virtualRow.index]!.category)"
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                >
                  {{ $t(`portfolioDetail.transactionsList.categories.${transactions[virtualRow.index]!.category}`) }}
                </span>
              </div>
              <div class="text-right tabular-nums">
                {{ parseFloat(transactions[virtualRow.index]!.quantity as string).toFixed(2) }}
              </div>
              <div class="text-right tabular-nums">
                {{
                  formatAmountByCurrencyCode(
                    parseFloat(transactions[virtualRow.index]!.price as string),
                    transactions[virtualRow.index]!.security!.currencyCode,
                  )
                }}
              </div>
              <div class="text-right tabular-nums">
                {{
                  formatAmountByCurrencyCode(
                    parseFloat(transactions[virtualRow.index]!.fees as string),
                    transactions[virtualRow.index]!.security!.currencyCode,
                  )
                }}
              </div>
              <div class="text-right font-medium tabular-nums">
                {{
                  formatAmountByCurrencyCode(
                    parseFloat(transactions[virtualRow.index]!.amount as string),
                    transactions[virtualRow.index]!.security!.currencyCode,
                  )
                }}
              </div>
              <div class="text-center">
                <DeleteInvestmentTransactionDialog :transaction-id="transactions[virtualRow.index]!.id">
                  <DesktopOnlyTooltip :content="$t('portfolioDetail.transactionsList.deleteTransaction.tooltip')">
                    <UiButton
                      variant="ghost-destructive"
                      size="icon"
                      class="size-7"
                      :aria-label="$t('portfolioDetail.transactionsList.deleteTransaction.tooltip')"
                    >
                      <Trash2Icon class="size-3.5" />
                    </UiButton>
                  </DesktopOnlyTooltip>
                </DeleteInvestmentTransactionDialog>
              </div>
            </div>
          </template>
          <div v-else class="text-muted-foreground flex items-center justify-center px-3 py-2 text-xs">
            {{ $t('portfolioDetail.transactionsList.loadingMore') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
