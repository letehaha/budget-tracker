<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import InputField from "@/components/fields/input-field.vue";
import Button from "@/components/lib/ui/button/Button.vue";
import Card from "@/components/lib/ui/card/Card.vue";
import { loadBudgetById, editBudget, addTransactionsToBudget } from "@/api/budgets";
import { useNotificationCenter } from "@/components/notification-center";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { VUE_QUERY_CACHE_KEYS } from "@/common/const";
import { cloneDeep } from "lodash-es";
import UiButton from "@/components/common/ui-button.vue";
import DateField from "@/components/fields/date-field.vue";
import ResponsiveDialog from "@/components/common/responsive-dialog.vue";
import TransactionsList from "@/components/transactions-list/transactions-list.vue";
import { useTransactions } from "@/composable/data-queries/get-transactions";
const route = useRoute();
const queryClient = useQueryClient();
const { addErrorNotification } = useNotificationCenter();
const budgetData = ref();
const pickedTransactionsIds = ref([]);
const isAddingTransactionModalVisible = ref<boolean>(false);
const transactionPicking = ref<boolean>(true);
const currentBudgetId = ref<number>(Number(route.params.id));
const DEFAULT_CHANGE_DATA: {
  name: string | null;
  limitAmount?: number | null;
} = {
  name: null,
  limitAmount: 0,
} as const;
const changeForm = ref({ ...DEFAULT_CHANGE_DATA });
const budgetFilters = ref({
  transactionType: null,
  budgetIds: [currentBudgetId.value],
});
const pickedTransactionsListFilter = ref({
  transactionType: null,
  excludedBudgetIds: [currentBudgetId.value],
});
const isTransactionsPicked = computed(() => !!pickedTransactionsIds.value.length);
const {
  transactionsPages: budgetTransactionsList,
  fetchNextPage: budgetFetchNextPage,
  hasNextPage: budgetIsNextPage,
  isFetched: budgetIsLoadingTransactionsPick,
} = useTransactions<number[]>({
  filters: budgetFilters,
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetAddingTransactionList, ref([currentBudgetId.value])],
});
const { data: budgetItem, isLoading } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});
const { mutate } = useMutation({
  mutationFn: editBudget,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
  },
});
const {
  transactionsPages: transactionsList,
  fetchNextPage: fetchNextTransactionPage,
  hasNextPage: isNextTransactionPage,
  isFetched: isLoadingTransactionsPick,
} = useTransactions<number[]>({
  filters: pickedTransactionsListFilter,
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetTransactionList, ref([currentBudgetId.value])],
  queryOptions: {
    enabled: isAddingTransactionModalVisible,
  },
});
const toggleBudgetChanges = async () => {
  changeForm.value.name = budgetData.value.name;
  changeForm.value.limitAmount = budgetData.value.limitAmount;
  await mutate({ budgetId: currentBudgetId.value, payload: changeForm.value });
};
const openAddTransactionModal = async () => {
  isAddingTransactionModalVisible.value = true;
};
const addTransactions = async () => {
  const data = {
    transactionIds: pickedTransactionsIds.value,
  };
  try {
    await addTransactionsToBudget(currentBudgetId.value, data);
  } catch (err) {
    addErrorNotification(err.data.message);
  }
  isAddingTransactionModalVisible.value = false;
  pickedTransactionsIds.value = [];
};
watchEffect(() => {
  if (!isLoading.value && budgetItem.value) {
    budgetData.value = cloneDeep(budgetItem.value);
    budgetData.value.startDate = new Date(budgetData.value.startDate);
    budgetData.value.endDate = new Date(budgetData.value.endDate);
  }
});
</script>

<template>
  <div
    v-if="!isLoading"
    class="flex flex-col w-min lg:w-auto lg:flex-row gap-4 xl:gap-20 max-w-full p-4"
  >
    <div class="@[360px]/budget-item-info:w-full lg:w-[450px] lg:max-w-[450px]">
      <h1 class="text-2xl mb-4 tracking-wider">Budget Info</h1>
      <Card class="flex flex-col gap-5 p-4">
        <InputField
          v-model="budgetData.name"
          label="Budget name"
          autofocus
          placeholder="Name"
          class="w-full"
          @click.stop
        />

        <InputField
          v-model="budgetData.limitAmount"
          label="Budget category"
          placeholder="Budget category"
          class="w-full"
          @click.stop
        />

        <div class="flex justify-between gap-4 @[450px]/budget-item-info:flex-col">
          <DateField
            v-model="budgetData.startDate"
            :disabled="true"
            :calendar-mode="'date'"
            label="From date"
          />
          <DateField v-model="budgetData.endDate" :disabled="true" label="To date" />
        </div>

        <div class="flex gap-2">
          <Button variant="secondary" class="w-full" @click="toggleBudgetChanges">Change</Button>
          <Button class="w-full" @click="openAddTransactionModal">Pick Transactions</Button>
        </div>
      </Card>
    </div>
    <Card class="py-4 px-2 sm:p-6 rounded-md w-screen max-w-full sm:max-w-[450px]">
      <div>
        <template v-if="budgetIsLoadingTransactionsPick && budgetTransactionsList">
          <TransactionsList :transactions="budgetTransactionsList.pages.flat()" />
        </template>
      </div>
      <template v-if="budgetIsNextPage">
        <UiButton
          type="button"
          variant="secondary"
          class="w-full mt-8"
          @click="() => budgetFetchNextPage()"
        >
          Load more
        </UiButton>
      </template>
      <template v-else>
        <p>No more data to load</p>
      </template>
    </Card>

    <ResponsiveDialog v-model:open="isAddingTransactionModalVisible">
      <template #trigger>
        <slot />
      </template>

      <template #title>
        <span> Add transactions </span>
      </template>

      <div
        v-if="isLoadingTransactionsPick && transactionsList"
        class="max-h-[70vh] w-full overflow-y-auto"
      >
        <TransactionsList
          :transactions="transactionsList.pages.flat()"
          :is-transaction-picking="transactionPicking"
          @update:picked-transactions="pickedTransactionsIds = $event"
        />
      </div>
      <div class="flex gap-2">
        <UiButton
          type="button"
          variant="outline"
          theme="light-dark"
          class="w-full mt-8"
          :disabled="!isTransactionsPicked"
          @click="addTransactions"
        >
          Add Selected
        </UiButton>
        <template v-if="isNextTransactionPage">
          <UiButton
            type="button"
            variant="secondary"
            class="w-full mt-8"
            @click="() => fetchNextTransactionPage()"
          >
            Load more
          </UiButton>
        </template>
        <template v-else>
          <p>No more data to load</p>
        </template>
      </div>
    </ResponsiveDialog>
  </div>
</template>
