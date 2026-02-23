<script lang="ts" setup>
import { loadTransactions as apiLoadTransactions } from '@/api/transactions';
import type { DashboardWidgetConfig } from '@/api/user-settings';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { buttonVariants } from '@/components/lib/ui/button';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useRootStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { ListIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';
import { computed, inject } from 'vue';

import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

const { isAppInitialized } = storeToRefs(useRootStore());
const widgetConfigRef = inject<Ref<DashboardWidgetConfig> | null>('dashboard-widget-config', null);

const maxDisplay = computed(() => {
  const config = widgetConfigRef?.value;
  if (!config) return 10;
  return (config.rowSpan ?? 1) >= 2 ? 12 : 5;
});

const { data: transactions, isFetching } = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.widgetLatestRecords,
  queryFn: () => apiLoadTransactions({ limit: 20, from: 0, includeSplits: true, includeTags: true }), // Over-fetch to account for deduplication
  staleTime: Infinity,
  placeholderData: [],
  enabled: isAppInitialized,
});

const isInitialLoading = computed(() => isFetching.value && transactions.value.length === 0);
const isDataEmpty = computed(() => !isFetching.value && transactions.value.length === 0);
</script>

<template>
  <WidgetWrapper :is-fetching="isFetching">
    <template #title> {{ $t('dashboard.widgets.latestTransactions.title') }} </template>
    <template #action>
      <template v-if="!isDataEmpty && !isInitialLoading">
        <router-link
          :class="buttonVariants({ variant: 'ghost', size: 'sm', class: 'text-muted-foreground' })"
          :to="{ name: ROUTES_NAMES.transactions }"
        >
          {{ $t('dashboard.widgets.latestTransactions.showAll') }}
        </router-link>
      </template>
    </template>
    <template v-if="isInitialLoading">
      <LoadingState />
    </template>
    <template v-else-if="isDataEmpty">
      <EmptyState>
        <ListIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <TransactionsList raw-list class="!gap-0.5" :transactions="transactions || []" :max-display="maxDisplay" />
    </template>
  </WidgetWrapper>
</template>
