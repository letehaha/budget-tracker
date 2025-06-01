<script lang="ts" setup>
import { loadTransactions as apiLoadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import UiButton from '@/components/lib/ui/button/Button.vue';
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
  queryFn: () => apiLoadTransactions({ limit: 9, from: 0 }),
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
        <router-link class="text-primary block text-center" :to="{ name: ROUTES_NAMES.transactions }">
          <ui-button variant="link" as="span" size="sm"> Show all </ui-button>
        </router-link>
      </template>
    </template>
    <template v-if="isDataEmpty">
      <EmptyState>
        <ListIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <TransactionsList class="gap-1" :transactions="transactions || []" />
    </template>
  </WidgetWrapper>
</template>
