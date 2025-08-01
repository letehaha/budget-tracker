<script setup lang="ts">
import { addTransactionsToBudget, loadBudgetById } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { useNotificationCenter } from '@/components/notification-center';
import RecordsFiltersDialog from '@/components/records-filters/filters-dialog.vue';
import RecordsFilters from '@/components/records-filters/index.vue';
import { useTransactionsWithFilters } from '@/components/records-filters/transactions-with-filters';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useShiftMultiSelect } from '@/composable/shift-multi-select';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { cloneDeep } from 'lodash-es';
import { computed, reactive, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const { addErrorNotification } = useNotificationCenter();
const budgetData = ref();
const queryClient = useQueryClient();

const pickedTransactionsIds = reactive<Set<number>>(new Set());
const { handleSelection, resetSelection, isShiftKeyPressed } = useShiftMultiSelect(pickedTransactionsIds);

const isAddingTransactionModalVisible = ref<boolean>(false);
const currentBudgetId = ref<number>(Number(route.params.id));
const isTransactionsPicked = computed(() => !!pickedTransactionsIds.size);
const { data: budgetItem, isLoading } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});

const {
  isResetButtonDisabled,
  isFiltersOutOfSync,
  resetFilters,
  applyFilters,
  appliedFilters,
  isAnyFiltersApplied,
  filters,
  transactionsPages,
  fetchNextPage: fetchNextTransactionPage,
  hasNextPage: hasNextTransactionsPage,
  isFetchingNextPage: isFetchingNextTransactionsPage,
  invalidate,
} = useTransactionsWithFilters({
  appendQueryKey: [currentBudgetId],
  queryEnabled: isAddingTransactionModalVisible,
  staticFilters: { excludedBudgetIds: [currentBudgetId.value] },
});

const addTransactions = async () => {
  const data = {
    transactionIds: [...pickedTransactionsIds.values()],
  };
  try {
    await addTransactionsToBudget(currentBudgetId.value, data);
    invalidate();
    queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, currentBudgetId] });
    queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.budgetAddingTransactionList, currentBudgetId] });
  } catch (err) {
    addErrorNotification(err.data.message);
  }
  isAddingTransactionModalVisible.value = false;
  resetSelection();
};

watchEffect(() => {
  if (!isLoading.value && budgetItem.value) {
    budgetData.value = cloneDeep(budgetItem.value);
    budgetData.value.startDate = new Date(budgetData.value.startDate);
    budgetData.value.endDate = new Date(budgetData.value.endDate);
  }
});

const parentRef = ref(null);

const flatTransactions = computed(() => transactionsPages.value?.pages?.flat() ?? []);

const { virtualRows, totalSize } = useVirtualizedInfiniteScroll({
  items: flatTransactions,
  hasNextPage: hasNextTransactionsPage,
  fetchNextPage: fetchNextTransactionPage,
  isFetchingNextPage: isFetchingNextTransactionsPage,
  parentRef,
  enabled: isAddingTransactionModalVisible,
  getItemKey: (index) => flatTransactions.value[index].id,
});

const isFiltersDialogOpen = ref(false);

watch(appliedFilters, () => {
  isFiltersDialogOpen.value = false;
});

const isMobileView = useWindowBreakpoints(1024);
</script>

<template>
  <ResponsiveDialog v-model:open="isAddingTransactionModalVisible" dialogContentClass="max-w-[900px]">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      <span> Add transactions </span>
    </template>

    <div class="grid max-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[max-content,minmax(0,1fr)]">
      <div class="relative overflow-y-auto px-1">
        <template v-if="isMobileView">
          <RecordsFiltersDialog v-model:open="isFiltersDialogOpen" :isAnyFiltersApplied="isAnyFiltersApplied">
            <div class="relative max-h-[calc(100vh-var(--header-height)-32px)] overflow-auto">
              <RecordsFilters
                v-model:filters="filters"
                :is-reset-button-disabled="isResetButtonDisabled"
                :is-filters-out-of-sync="isFiltersOutOfSync"
                @reset-filters="resetFilters"
                @apply-filters="applyFilters"
              />
            </div>
          </RecordsFiltersDialog>
        </template>
        <template v-else>
          <RecordsFilters
            v-model:filters="filters"
            :is-reset-button-disabled="isResetButtonDisabled"
            :is-filters-out-of-sync="isFiltersOutOfSync"
            @reset-filters="resetFilters"
            @apply-filters="applyFilters"
          />
        </template>
      </div>

      <div v-if="transactionsPages" ref="parentRef" class="relative max-h-[60vh] w-full overflow-y-auto md:max-h-full">
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
                'grid grid-cols-[min-content,minmax(0,1fr)] items-center gap-2',
                { 'select-none': isShiftKeyPressed },
              ]"
            >
              <Checkbox
                :checked="pickedTransactionsIds.has(flatTransactions[virtualRow.index].id)"
                @update:checked="
                  handleSelection(
                    $event,
                    flatTransactions[virtualRow.index].id,
                    virtualRow.index,
                    flatTransactions,
                    (v) => v.id,
                  )
                "
              />
              <TransactionRecord :tx="flatTransactions[virtualRow.index]" />
            </label>
            <div v-else class="flex h-[52px] items-center justify-center">Loading more...</div>
          </div>
        </div>
        <template v-if="!hasNextTransactionsPage">
          <p class="flex justify-center">No more data to load</p>
        </template>
        <div v-if="isTransactionsPicked" class="sticky -bottom-px flex gap-2">
          <Button type="button" variant="secondary" class="hover:bg-initial mt-8 w-full" @click="addTransactions">
            Add Selected
          </Button>
        </div>
      </div>
    </div>
  </ResponsiveDialog>
</template>
