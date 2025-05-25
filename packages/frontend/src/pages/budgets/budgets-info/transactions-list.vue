<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import UiButton from '@/components/common/ui-button.vue';
import Card from '@/components/lib/ui/card/Card.vue';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { useTransactions } from '@/composable/data-queries/get-transactions';
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const currentBudgetId = ref<number>(Number(route.params.id));
const budgetFilters = ref({
  transactionType: null,
  budgetIds: [currentBudgetId.value],
});
const {
  transactionsPages: budgetTransactionsList,
  fetchNextPage,
  hasNextPage,
  isFetched,
} = useTransactions<number[]>({
  filters: budgetFilters,
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetAddingTransactionList, ref([currentBudgetId.value])],
});
</script>

<template>
  <Card class="w-screen max-w-full rounded-md px-2 py-4 sm:max-w-[450px] sm:p-6">
    <div>
      <template v-if="isFetched && budgetTransactionsList">
        <TransactionsList :transactions="budgetTransactionsList.pages.flat()" />
      </template>
    </div>
    <template v-if="hasNextPage">
      <UiButton type="button" variant="secondary" class="mt-8 w-full" @click="() => fetchNextPage()">
        Load more
      </UiButton>
    </template>
    <template v-else>
      <p>No more data to load</p>
    </template>
  </Card>
</template>
