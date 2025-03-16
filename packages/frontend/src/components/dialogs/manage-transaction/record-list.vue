<template>
  <div class="record-list" data-cy="record-list-modal">
    <template v-if="isFetched && transactionsPages">
      <div v-for="item in transactionsPages?.pages?.flat()" :key="item.id">
        <TransactionRecrod :tx="item" @record-click="(payload) => handlerRecordClick(payload[0])" />
      </div>
    </template>
    <template v-if="hasNextPage">
      <button class="record-list__load-more" type="button" @click="() => fetchNextPage()">Load more</button>
    </template>
    <template v-else>
      <p>No more data to load</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import TransactionRecrod from '@/components/transactions-list/transaction-record.vue';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery } from '@tanstack/vue-query';

const props = defineProps<{
  transactionType: TRANSACTION_TYPES;
}>();

const emit = defineEmits<{
  select: [value: TransactionModel];
}>();

const limit = 15;
const fetchTransactions = ({ pageParam = 0 }) => {
  const from = pageParam * limit;
  return loadTransactions({
    limit,
    from,
    transactionType: props.transactionType,
    excludeTransfer: true,
  });
};

const {
  data: transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetched,
} = useInfiniteQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.recordsPageTransactionList, props.transactionType],
  queryFn: fetchTransactions,
  initialPageParam: 0,
  getNextPageParam: (lastPage, pages) => {
    // No more pages to load
    if (lastPage.length < limit) return undefined;
    // returns the number of pages fetched so far as the next page param
    return pages.length;
  },
  staleTime: Infinity,
});

const handlerRecordClick = (transaction: TransactionModel) => {
  emit('select', transaction);
};
</script>

<style lang="scss" scoped>
.record-list {
  max-width: 420px;
  width: 100%;
  max-height: 100%;
  padding: 16px;
  background-color: var(--app-surface-color);
}
.record-list__load-more {
  background-color: transparent;
  border: none;
  cursor: pointer;

  color: var(--app-primary);

  display: block;
  margin: auto;

  font-size: 16px;

  margin-top: 32px;
}
</style>
