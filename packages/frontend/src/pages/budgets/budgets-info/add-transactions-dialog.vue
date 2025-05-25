<script setup lang="ts">
import { addTransactionsToBudget, loadBudgetById } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/common/ui-button.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { useNotificationCenter } from '@/components/notification-center';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useTransactions } from '@/composable/data-queries/get-transactions';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { useQuery } from '@tanstack/vue-query';
import { cloneDeep } from 'lodash-es';
import { computed, reactive, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const { addErrorNotification } = useNotificationCenter();
const budgetData = ref();
const pickedTransactionsIds = reactive<Set<number>>(new Set());
const isAddingTransactionModalVisible = ref<boolean>(false);
const currentBudgetId = ref<number>(Number(route.params.id));
const pickedTransactionsListFilter = ref({
  transactionType: null,
  excludedBudgetIds: [currentBudgetId.value],
});
const isTransactionsPicked = computed(() => !!pickedTransactionsIds.size);
const { data: budgetItem, isLoading } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});
const {
  transactionsPages: transactionsList,
  fetchNextPage: fetchNextTransactionPage,
  hasNextPage: hasNextTransactionsPage,
  isFetched: isLoadingTransactionsPick,
  isFetchingNextPage: isFetchingNextTransactionsPage,
} = useTransactions({
  filters: pickedTransactionsListFilter,
  queryOptions: {
    queryKey: [...VUE_QUERY_CACHE_KEYS.budgetTransactionList, currentBudgetId],
    enabled: isAddingTransactionModalVisible,
  },
});

const addTransactions = async () => {
  const data = {
    transactionIds: [...pickedTransactionsIds.values()],
  };
  try {
    await addTransactionsToBudget(currentBudgetId.value, data);
  } catch (err) {
    addErrorNotification(err.data.message);
  }
  isAddingTransactionModalVisible.value = false;
  pickedTransactionsIds.clear();
};

watchEffect(() => {
  if (!isLoading.value && budgetItem.value) {
    budgetData.value = cloneDeep(budgetItem.value);
    budgetData.value.startDate = new Date(budgetData.value.startDate);
    budgetData.value.endDate = new Date(budgetData.value.endDate);
  }
});

const parentRef = ref(null);

const flatTransactions = computed(() => transactionsList.value?.pages?.flat() ?? []);

const { virtualRows, totalSize } = useVirtualizedInfiniteScroll({
  items: flatTransactions,
  hasNextPage: hasNextTransactionsPage,
  fetchNextPage: fetchNextTransactionPage,
  isFetchingNextPage: isFetchingNextTransactionsPage,
  parentRef,
  enabled: isAddingTransactionModalVisible,
});

const pickTransaction = (value: boolean, id: number) => {
  if (value) {
    pickedTransactionsIds.add(id);
  } else {
    pickedTransactionsIds.delete(id);
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isAddingTransactionModalVisible">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      <span> Add transactions </span>
    </template>

    <div
      v-if="isLoadingTransactionsPick && transactionsList"
      ref="parentRef"
      class="relative max-h-[70vh] w-full overflow-y-auto"
    >
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
            class="grid grid-cols-[min-content,minmax(0,1fr)] items-center gap-2"
          >
            <Checkbox
              :checked="pickedTransactionsIds.has(flatTransactions[virtualRow.index].id)"
              @update:checked="pickTransaction($event, flatTransactions[virtualRow.index].id)"
            />
            <TransactionRecord :tx="flatTransactions[virtualRow.index]" />
          </label>
          <div v-else class="flex h-[52px] items-center justify-center">Loading more...</div>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <UiButton
        type="button"
        variant="outline"
        theme="light-dark"
        class="mt-8 w-full"
        :disabled="!isTransactionsPicked"
        @click="addTransactions"
      >
        Add Selected
      </UiButton>

      <template v-if="!hasNextTransactionsPage">
        <p>No more data to load</p>
      </template>
    </div>
  </ResponsiveDialog>
</template>
