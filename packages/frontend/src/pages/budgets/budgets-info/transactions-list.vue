<script setup lang="ts">
import { removeTransactionsFromBudget } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Button from '@/components/lib/ui/button/Button.vue';
import Card from '@/components/lib/ui/card/Card.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { useNotificationCenter } from '@/components/notification-center';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { useTransactions } from '@/composable/data-queries/get-transactions';
import { useShiftMultiSelect } from '@/composable/shift-multi-select';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import AddTransactionsDialog from './add-transactions-dialog.vue';

defineProps<{ isBudgetDataUpdating: boolean; budgetId: number }>();

const { addSuccessNotification } = useNotificationCenter();

const route = useRoute();
const queryClient = useQueryClient();
const currentBudgetId = ref<number>(Number(route.params.id));

const isUnlinkingSelectionEnabled = ref(false);
const pickedTransactionsIds = reactive<Set<number>>(new Set());
const isTransactionsPicked = computed(() => !!pickedTransactionsIds.size);
const { handleSelection, resetSelection, isShiftKeyPressed } = useShiftMultiSelect(pickedTransactionsIds);

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
    addSuccessNotification('Unlinked');
    invalidate();
    isUnlinkingSelectionEnabled.value = false;
    pickedTransactionsIds.clear();
    queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, currentBudgetId] });
    resetSelection();
  },
});
</script>

<template>
  <Card class="w-screen max-w-full rounded-md px-2 py-4 sm:max-w-[450px] sm:p-6">
    <div class="mb-4 flex justify-end gap-4">
      <template v-if="isUnlinkingSelectionEnabled">
        <Button
          :disabled="!isTransactionsPicked || isMutating"
          @click="() => mutate({ budgetId, payload: { transactionIds: [...pickedTransactionsIds.values()] } })"
          variant="default"
        >
          Unlink
        </Button>
        <Button
          :disabled="isMutating || isMutating"
          @click="
            () => {
              isUnlinkingSelectionEnabled = false;
              resetSelection();
            }
          "
          variant="secondary"
        >
          Cancel
        </Button>
      </template>
      <template v-else>
        <Button
          :disabled="isBudgetDataUpdating"
          @click="() => (isUnlinkingSelectionEnabled = !isUnlinkingSelectionEnabled)"
          variant="secondary"
        >
          Unlink
        </Button>
      </template>

      <AddTransactionsDialog>
        <Button :disabled="isBudgetDataUpdating" variant="secondary">Add More</Button>
      </AddTransactionsDialog>
    </div>

    <template v-if="!isUnlinkingSelectionEnabled">
      <template v-if="isFetched && budgetTransactionsList">
        <TransactionsList
          :hasNextPage="hasNextPage"
          :isFetchingNextPage="isFetchingNextPage"
          :transactions="flatTransactions"
          @fetch-next-page="fetchNextPage"
        />
      </template>
    </template>
    <template v-else>
      <div
        v-if="budgetTransactionsList"
        ref="parentRef"
        class="relative max-h-[60vh] w-full overflow-y-auto md:max-h-full"
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
              :class="[
                'grid grid-cols-[min-content_minmax(0,1fr)] items-center gap-2',
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
      </div>
    </template>
  </Card>
</template>
