<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
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
  isFetchingNextPage,
  isFetched,
} = useTransactions({
  filters: budgetFilters,
  queryOptions: {
    queryKey: [...VUE_QUERY_CACHE_KEYS.budgetAddingTransactionList, currentBudgetId],
  },
});
</script>

<template>
  <Card class="w-screen max-w-full rounded-md px-2 py-4 sm:max-w-[450px] sm:p-6">
    <template v-if="$slots['header']">
      <slot name="header" />
    </template>

    <template v-if="isFetched && budgetTransactionsList">
      <TransactionsList
        :hasNextPage="hasNextPage"
        :isFetchingNextPage="isFetchingNextPage"
        :transactions="budgetTransactionsList.pages.flat()"
        class="max-h-[70vh]"
        @fetch-next-page="fetchNextPage"
      />
    </template>
  </Card>
</template>
