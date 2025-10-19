<script lang="ts" setup>
import { loadTransactions as apiLoadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { buttonVariants } from '@/components/lib/ui/button';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useRootStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { ListIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import EmptyState from './components/empty-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

const { isAppInitialized } = storeToRefs(useRootStore());

const { data: transactions } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.widgetLatestRecords,
  queryFn: () => apiLoadTransactions({ limit: 20, from: 0 }), // Over-fetch to account for deduplication
  staleTime: Infinity,
  placeholderData: [],
  enabled: isAppInitialized,
});

const isDataEmpty = computed(() => transactions.value.length === 0);
</script>

<template>
  <WidgetWrapper higher>
    <template #title> Latest Transactions </template>
    <template #action>
      <template v-if="!isDataEmpty">
        <router-link
          :class="buttonVariants({ variant: 'link', size: 'sm', class: 'text-primary block text-center' })"
          :to="{ name: ROUTES_NAMES.transactions }"
        >
          <span>Show all</span>
        </router-link>
      </template>
    </template>
    <template v-if="isDataEmpty">
      <EmptyState>
        <ListIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <TransactionsList raw-list class="gap-1" :transactions="transactions || []" :max-display="10" />
    </template>
  </WidgetWrapper>
</template>
