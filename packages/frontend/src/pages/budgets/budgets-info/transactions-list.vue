<script setup lang="ts">
import { removeTransactionsFromBudget } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Button from '@/components/lib/ui/button/Button.vue';
import Card from '@/components/lib/ui/card/Card.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { useNotificationCenter } from '@/components/notification-center';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { useTransactions } from '@/composable/data-queries/get-transactions';
import { useShiftMultiSelect } from '@/composable/shift-multi-select';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { AlertTriangleIcon, LinkIcon, PlusIcon, WalletIcon, XIcon } from 'lucide-vue-next';
import { computed, inject, nextTick, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import AddTransactionsDialog from './add-transactions-dialog.vue';

// Inject the dashboard scroll area viewport
const scrollAreaViewport = inject<ReturnType<typeof ref<{ viewportElement: HTMLElement } | null>>>(
  SCROLL_AREA_IDS.dashboard,
);

defineProps<{ isBudgetDataUpdating: boolean; budgetId: number }>();

const { addSuccessNotification } = useNotificationCenter();

const route = useRoute();
const queryClient = useQueryClient();
const currentBudgetId = ref<number>(Number(route.params.id));

const cardRef = ref<InstanceType<typeof Card> | null>(null);
const isUnlinkingSelectionEnabled = ref(false);
const pickedTransactionsIds = reactive<Set<number>>(new Set());
const isTransactionsPicked = computed(() => !!pickedTransactionsIds.size);
const { handleSelection, resetSelection, isShiftKeyPressed } = useShiftMultiSelect(pickedTransactionsIds);

const enableUnlinkingMode = async () => {
  isUnlinkingSelectionEnabled.value = true;
  await nextTick();
  // Scroll the card into view within the scroll area
  const viewport = scrollAreaViewport?.value?.viewportElement;
  const cardEl = cardRef.value?.$el as HTMLElement;
  if (viewport && cardEl) {
    const headerHeight = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--header-height') || '64',
    );
    const cardTop = cardEl.offsetTop - headerHeight;
    viewport.scrollTo({ top: cardTop, behavior: 'smooth' });
  }
};

const budgetFilters = ref({
  transactionType: null,
  budgetIds: [currentBudgetId.value],
});
const {
  data: budgetTransactionsList,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isFetched,
  invalidate,
} = useTransactions({
  filters: budgetFilters,
  queryOptions: {
    queryKey: [...VUE_QUERY_CACHE_KEYS.budgetAddingTransactionList, currentBudgetId],
  },
});

const parentRef = ref(null);
const flatTransactions = computed(() => {
  return budgetTransactionsList.value?.pages?.flat() ?? [];
});
const { virtualRows, totalSize } = useVirtualizedInfiniteScroll({
  items: flatTransactions,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  parentRef,
  getItemKey: (index) => flatTransactions.value[index].id,
});

const { isPending: isMutating, mutate } = useMutation({
  mutationFn: removeTransactionsFromBudget,
  onSuccess: () => {
    addSuccessNotification('Transactions unlinked successfully!');
    invalidate();
    isUnlinkingSelectionEnabled.value = false;
    pickedTransactionsIds.clear();
    queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, currentBudgetId] });
    resetSelection();
  },
});

const cancelUnlinking = async () => {
  // Preserve scroll position before mode change
  const viewport = scrollAreaViewport?.value?.viewportElement;
  const scrollTop = viewport?.scrollTop ?? 0;
  isUnlinkingSelectionEnabled.value = false;
  resetSelection();
  await nextTick();
  // Restore scroll position after DOM updates
  if (viewport) {
    viewport.scrollTop = scrollTop;
  }
};

// Select All functionality
const isAllSelected = computed(() => {
  if (flatTransactions.value.length === 0) return false;
  return flatTransactions.value.every((tx) => pickedTransactionsIds.has(tx.id));
});

const isSomeSelected = computed(() => {
  if (flatTransactions.value.length === 0) return false;
  return flatTransactions.value.some((tx) => pickedTransactionsIds.has(tx.id)) && !isAllSelected.value;
});

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // Deselect all
    pickedTransactionsIds.clear();
  } else {
    // Select all
    flatTransactions.value.forEach((tx) => {
      pickedTransactionsIds.add(tx.id);
    });
  }
};
</script>

<template>
  <Card
    ref="cardRef"
    class="@container overflow-clip border! border-transparent transition-all duration-200"
    :class="{ 'border-warning/40': isUnlinkingSelectionEnabled }"
    :style="{ scrollMarginTop: 'var(--header-height, 64px)' }"
  >
    <!-- Sticky Header Container -->
    <div
      class="bg-card sticky z-20 -mx-px -mt-px rounded-t-lg border-x border-t border-transparent"
      :class="{ 'border-warning-text/50': isUnlinkingSelectionEnabled }"
      :style="{ top: 'var(--header-height, 64px)' }"
    >
      <!-- Warning Banner (Selection Mode) -->
      <div
        v-if="isUnlinkingSelectionEnabled"
        class="bg-warning-text/10 border-warning-text/30 flex items-center gap-2 border-b px-3 py-2 @md:px-4"
      >
        <AlertTriangleIcon class="text-warning-text size-4 shrink-0" />
        <span class="text-warning-text text-xs font-medium @md:text-sm">
          Selection mode — choose transactions to unlink
        </span>
      </div>

      <!-- Action Bar -->
      <div class="border-border/50 border-b px-3 py-2 @md:px-4 @md:py-3">
        <template v-if="isUnlinkingSelectionEnabled">
          <!-- Stacked Layout (narrow container) -->
          <div class="flex flex-col gap-3 @lg:hidden">
            <div class="flex items-center justify-between">
              <!-- Select All Checkbox -->
              <label class="flex cursor-pointer items-center gap-2">
                <Checkbox
                  :model-value="isAllSelected"
                  :indeterminate="isSomeSelected"
                  @update:model-value="toggleSelectAll"
                />
                <span class="text-muted-foreground text-sm">Select all</span>
              </label>

              <!-- Selection Counter Badge -->
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums"
                :class="
                  pickedTransactionsIds.size > 0
                    ? 'bg-warning-text/20 text-warning-text'
                    : 'bg-muted text-muted-foreground'
                "
              >
                {{ pickedTransactionsIds.size }} selected
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                :disabled="!isTransactionsPicked || isMutating"
                @click="() => mutate({ budgetId, payload: { transactionIds: [...pickedTransactionsIds.values()] } })"
                variant="destructive"
                size="sm"
                class="flex-1"
              >
                <LinkIcon class="mr-2 size-4" />
                Unlink
              </Button>
              <Button :disabled="isMutating" @click="cancelUnlinking" variant="outline" size="sm" class="flex-1">
                <XIcon class="mr-2 size-4" />
                Cancel
              </Button>
            </div>
          </div>

          <!-- Row Layout (wide container) -->
          <div class="hidden items-center justify-between @lg:flex">
            <div class="flex items-center gap-3">
              <!-- Select All Checkbox -->
              <label class="flex cursor-pointer items-center gap-2">
                <Checkbox
                  :model-value="isAllSelected"
                  :indeterminate="isSomeSelected"
                  @update:model-value="toggleSelectAll"
                />
                <span class="text-muted-foreground text-sm">Select all</span>
              </label>

              <!-- Selection Counter Badge -->
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums"
                :class="
                  pickedTransactionsIds.size > 0
                    ? 'bg-warning-text/20 text-warning-text'
                    : 'bg-muted text-muted-foreground'
                "
              >
                {{ pickedTransactionsIds.size }} selected
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                :disabled="!isTransactionsPicked || isMutating"
                @click="() => mutate({ budgetId, payload: { transactionIds: [...pickedTransactionsIds.values()] } })"
                variant="destructive"
                size="sm"
              >
                <LinkIcon class="mr-2 size-4" />
                Unlink Selected
              </Button>
              <Button :disabled="isMutating" @click="cancelUnlinking" variant="ghost" size="sm">
                <XIcon class="mr-2 size-4" />
                Cancel
              </Button>
            </div>
          </div>
        </template>

        <template v-else>
          <!-- Stacked Layout (Normal Mode) -->
          <div class="flex flex-col gap-3 @lg:hidden">
            <div class="text-muted-foreground text-sm">Manage linked transactions</div>
            <div class="flex items-center gap-2">
              <Button
                :disabled="isBudgetDataUpdating || flatTransactions.length === 0"
                @click="enableUnlinkingMode"
                variant="outline"
                size="sm"
                class="flex-1"
              >
                <LinkIcon class="mr-2 size-4" />
                Unlink
              </Button>
              <AddTransactionsDialog>
                <Button :disabled="isBudgetDataUpdating" size="sm" class="flex-1">
                  <PlusIcon class="mr-2 size-4" />
                  Add
                </Button>
              </AddTransactionsDialog>
            </div>
          </div>

          <!-- Row Layout (Normal Mode) -->
          <div class="hidden items-center justify-between @lg:flex">
            <div class="text-muted-foreground text-sm">Manage linked transactions</div>
            <div class="flex items-center gap-2">
              <Button
                :disabled="isBudgetDataUpdating || flatTransactions.length === 0"
                @click="enableUnlinkingMode"
                variant="outline"
                size="sm"
              >
                <LinkIcon class="mr-2 size-4" />
                Unlink
              </Button>
              <AddTransactionsDialog>
                <Button :disabled="isBudgetDataUpdating" size="sm">
                  <PlusIcon class="mr-2 size-4" />
                  Add Transactions
                </Button>
              </AddTransactionsDialog>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Transactions List -->
    <div class="p-3 @md:p-4">
      <template v-if="!isUnlinkingSelectionEnabled">
        <template v-if="isFetched && budgetTransactionsList">
          <template v-if="flatTransactions.length > 0">
            <TransactionsList
              :hasNextPage="hasNextPage"
              :isFetchingNextPage="isFetchingNextPage"
              :transactions="flatTransactions"
              @fetch-next-page="fetchNextPage"
            />
          </template>
          <template v-else>
            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <div class="bg-muted mb-4 flex size-16 items-center justify-center rounded-full">
                <WalletIcon class="text-muted-foreground size-8" />
              </div>
              <h3 class="mb-1 font-medium">No transactions linked</h3>
              <p class="text-muted-foreground mb-4 max-w-sm text-sm">
                Add transactions to this budget to start tracking your spending.
              </p>
              <AddTransactionsDialog>
                <Button size="sm">
                  <PlusIcon class="mr-2 size-4" />
                  Add Transactions
                </Button>
              </AddTransactionsDialog>
            </div>
          </template>
        </template>
      </template>

      <!-- Unlinking Mode -->
      <template v-else>
        <div v-if="budgetTransactionsList" ref="parentRef" class="relative w-full">
          <div :style="{ height: `${totalSize}px`, position: 'relative' }">
            <div
              v-for="virtualRow in virtualRows"
              :key="String(virtualRow.key)"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }"
            >
              <label
                v-if="flatTransactions[virtualRow.index]"
                :class="[
                  'grid cursor-pointer grid-cols-[min-content_minmax(0,1fr)] items-center gap-2 rounded-lg p-2 transition-colors @md:gap-3',
                  { 'select-none': isShiftKeyPressed },
                  pickedTransactionsIds.has(flatTransactions[virtualRow.index].id)
                    ? 'bg-warning-text/10 hover:bg-warning-text/15'
                    : 'hover:bg-muted/50',
                ]"
              >
                <Checkbox
                  :model-value="pickedTransactionsIds.has(flatTransactions[virtualRow.index].id)"
                  @update:model-value="
                    handleSelection(
                      !!$event,
                      flatTransactions[virtualRow.index].id,
                      virtualRow.index,
                      flatTransactions,
                      (v) => v.id,
                    )
                  "
                />
                <TransactionRecord :tx="flatTransactions[virtualRow.index]" />
              </label>
              <div v-else class="flex h-[52px] items-center justify-center">
                <span class="text-muted-foreground text-sm">Loading more...</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Card>
</template>
