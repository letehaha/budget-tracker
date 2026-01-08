<template>
  <div class="max-h-full w-full max-w-[420px] p-4" data-cy="record-list-modal">
    <template v-if="isFetched && transactionsPages">
      <div v-for="item in transactionsPages?.pages?.flat()" :key="item.id">
        <TransactionRecrod :tx="item" @record-click="(payload) => handlerRecordClick(payload[0])" />
      </div>
    </template>
    <template v-if="hasNextPage">
      <Button variant="secondary" class="mt-8 w-full" type="button" @click="() => fetchNextPage()">{{
        t('dialogs.manageTransaction.recordList.loadMore')
      }}</Button>
    </template>
    <template v-else>
      <p class="mt-4 text-center">{{ t('dialogs.manageTransaction.recordList.noMoreData') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Button from '@/components/lib/ui/button/Button.vue';
import TransactionRecrod from '@/components/transactions-list/transaction-record.vue';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
