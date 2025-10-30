<template>
  <div class="@container/settings">
    <div class="flex flex-col justify-start gap-4 p-6 @[800px]/settings:flex-row">
      <Card.Card class="w-full max-w-[600px]">
        <Header :account="account" />

        <Separator />
        <Card.CardContent>
          <template v-if="account.type === ACCOUNT_TYPES.monobank">
            <MonobankAccount :account="account" :transactions="rawTransactionsList" />
          </template>
          <template v-else-if="account.type === ACCOUNT_TYPES.lunchflow">
            <LunchflowAccount :account="account" :transactions="rawTransactionsList" />
          </template>
          <template v-else-if="account.type === ACCOUNT_TYPES.system">
            <SystemAccount :account="account" :transactions="rawTransactionsList" />
          </template>
        </Card.CardContent>
      </Card.Card>

      <Card.Card class="w-full max-w-[600px] pt-6">
        <Card.CardContent>
          <Tabs.Tabs default-value="records">
            <Tabs.TabsList class="w-full justify-start">
              <Tabs.TabsTrigger value="records"> Transactions </Tabs.TabsTrigger>
              <Tabs.TabsTrigger disabled value="analytics"> Analytics (soon) </Tabs.TabsTrigger>
            </Tabs.TabsList>
            <Tabs.TabsContent value="records">
              <template v-if="isFetched">
                <ScrollArea :scroll-area-id="SCROLL_AREA_IDS.accountTransactions" class="h-screen max-h-[600px]">
                  <TransactionsList
                    :hasNextPage="hasNextPage"
                    :transactions="rawTransactionsList"
                    :isFetchingNextPage="isFetchingNextPage"
                    :scroll-area-id="SCROLL_AREA_IDS.accountTransactions"
                    @fetch-next-page="fetchNextPage"
                  />
                </ScrollArea>
              </template>
            </Tabs.TabsContent>
          </Tabs.Tabs>
        </Card.CardContent>
      </Card.Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { loadTransactions } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import * as Card from '@/components/lib/ui/card';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { useAccountsStore, useRootStore } from '@/stores';
import { ACCOUNT_TYPES } from '@bt/shared/types';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import Header from './components/header.vue';
import MonobankAccount from './types/monobank/monobank.vue';
import LunchflowAccount from './types/lunchflow/lunchflow.vue';
import SystemAccount from './types/system/system.vue';

const route = useRoute();
const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);
const account = computed(() => accountsRecord.value[+route.params.id]);

const { isAppInitialized } = storeToRefs(useRootStore());

const limit = 10;

const fetchTransactions = ({ pageParam }: { pageParam: number }) => {
  const from = pageParam * limit;
  return loadTransactions({ limit, from, accountIds: [account.value.id] });
};

const {
  data: transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isFetched,
} = useInfiniteQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.accountSpecificTransactions, account],
  queryFn: fetchTransactions,
  initialPageParam: 0,
  getNextPageParam: (lastPage, pages) => {
    // No more pages to load
    if (lastPage.length < limit) return undefined;
    // returns the number of pages fetched so far as the next page param
    return pages.length;
  },
  enabled: isAppInitialized,
  staleTime: Infinity,
});

const rawTransactionsList = computed(() => transactionsPages.value?.pages?.flat() || []);
</script>
