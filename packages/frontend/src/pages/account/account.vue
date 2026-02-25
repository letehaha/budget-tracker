<template>
  <div class="@container/settings">
    <div v-if="!isAccountsFetched" class="flex h-[400px] items-center justify-center">
      <div class="text-muted-foreground text-sm">{{ t('pages.account.loading') }}</div>
    </div>

    <div v-else-if="!account" class="flex h-[400px] flex-col items-center justify-center gap-4">
      <div class="text-muted-foreground text-lg">{{ t('pages.account.notFound') }}</div>
      <p class="text-muted-foreground text-sm">{{ t('pages.account.notFoundDescription') }}</p>
      <Button variant="outline" @click="$router.push({ name: ROUTES_NAMES.accounts })">{{
        t('pages.account.goToAccounts')
      }}</Button>
    </div>

    <div v-else class="flex flex-col justify-start gap-4 p-6 @[800px]/settings:flex-row">
      <Card.Card class="w-full max-w-[600px]">
        <Header :account="account" />

        <!-- Account re-link warning banner -->
        <div
          v-if="account.needsRelink"
          class="bg-destructive/10 border-destructive/20 mx-6 mb-4 flex items-start gap-3 rounded-lg border p-4"
        >
          <AlertTriangleIcon class="text-destructive-text mt-0.5 size-5 shrink-0" />
          <div class="space-y-2">
            <p class="text-destructive-text text-sm font-medium">{{ t('pages.account.relinkWarning.title') }}</p>
            <p class="text-muted-foreground text-xs">
              {{ t('pages.account.relinkWarning.description') }}
              <span class="text-foreground font-medium"
                >"{{ t('pages.account.relinkWarning.connectionValidity') }}"</span
              >
              {{ t('pages.account.relinkWarning.in') }}
              <router-link
                v-if="account.bankDataProviderConnectionId"
                :to="{
                  name: ROUTES_NAMES.accountIntegrationDetails,
                  params: { connectionId: account.bankDataProviderConnectionId },
                }"
                class="text-primary hover:text-primary/80 inline-flex items-center gap-0.5 font-medium underline underline-offset-2"
              >
                {{ t('pages.account.relinkWarning.connectionSettings') }}
              </router-link>
              <template v-else>{{ t('pages.account.relinkWarning.settings') }}</template
              >{{ t('pages.account.relinkWarning.ifPersists') }}
              <span class="text-foreground font-medium">"{{ t('pages.account.relinkWarning.unlink') }}"</span>
              {{ t('pages.account.relinkWarning.belowThenLink') }}
            </p>
          </div>
        </div>

        <Separator />

        <Card.CardContent>
          <template v-if="account.bankDataProviderConnectionId">
            <BankConnectionView :account="account" :transactions="rawTransactionsList" />
          </template>
          <template v-else>
            <SystemAccount :account="account" :transactions="rawTransactionsList" />
          </template>
        </Card.CardContent>
      </Card.Card>

      <Card.Card class="w-full max-w-[600px] pt-6">
        <Card.CardContent>
          <Tabs.Tabs default-value="records">
            <Tabs.TabsList class="w-full justify-start">
              <Tabs.TabsTrigger value="records">{{ t('pages.account.rightPanel.transactions') }}</Tabs.TabsTrigger>
              <Tabs.TabsTrigger disabled value="analytics">{{
                t('pages.account.rightPanel.analyticsSoon')
              }}</Tabs.TabsTrigger>
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
import { Button } from '@/components/lib/ui/button';
import * as Card from '@/components/lib/ui/card';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { Separator } from '@/components/lib/ui/separator';
import * as Tabs from '@/components/lib/ui/tabs';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { AlertTriangleIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import Header from './components/header.vue';
import BankConnectionView from './types/bank-connection/index.vue';
import SystemAccount from './types/system/system.vue';

const { t } = useI18n();
const route = useRoute();
const accountsStore = useAccountsStore();
const { accountsRecord, isAccountsFetched } = storeToRefs(accountsStore);
const account = computed(() => accountsRecord.value[+route.params.id!] ?? null);

const limit = 10;

const fetchTransactions = ({ pageParam }: { pageParam: number }) => {
  const from = pageParam * limit;
  return loadTransactions({ limit, from, accountIds: [account.value!.id] });
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
  enabled: computed(() => isAccountsFetched.value && !!account.value),
  staleTime: Infinity,
});

const rawTransactionsList = computed(() => transactionsPages.value?.pages?.flat() || []);
</script>
