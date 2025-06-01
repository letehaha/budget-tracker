<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Button from '@/components/lib/ui/button/Button.vue';
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

    <div>
      <template v-if="isFetched && budgetTransactionsList">
        <TransactionsList :transactions="budgetTransactionsList.pages.flat()" />
      </template>
    </div>
    <template v-if="hasNextPage">
      <Button type="button" variant="secondary" class="mt-8 w-full" @click="() => fetchNextPage()"> Load more </Button>
    </template>
    <template v-else>
      <p>No more data to load</p>
    </template>
  </Card>
</template>
