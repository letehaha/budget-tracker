<template>
  <section class="flex min-h-full flex-col p-6">
    <!-- Main period selector - floating on mobile, normal flow on desktop -->
    <div
      v-if="!hasNoAccounts"
      :class="
        cn([
          'bg-background/95 supports-[backdrop-filter]:bg-background/80 z-(--z-navbar) order-last -mx-6 mt-auto border-t py-2 backdrop-blur',
          'max-md:right-0 max-md:left-0',
          'sticky md:top-[var(--header-height)]',
          isSafariMobile
            ? isPWA
              ? 'max-md:bottom-[calc(var(--bottom-navbar-height)-env(safe-area-inset-bottom)-1px)]'
              : 'max-md:bottom-[calc(var(--bottom-navbar-height-content-rect)-env(safe-area-inset-bottom)-1px)]'
            : 'max-md:bottom-[calc(env(safe-area-inset-bottom)-1px)]',
          'md:order-first md:mx-0 md:mt-0 md:mb-6 md:border-t-0 md:py-0',
        ])
      "
    >
      <PeriodSelector v-model="currentPeriod" />
    </div>

    <template v-if="hasNoAccounts">
      <DashboardOnboarding />
    </template>
    <template v-else>
      <div
        :class="[
          `grid gap-6 max-md:pb-4`,
          `xl:grid-cols-[minmax(0,1fr)_420px] xl:[grid-template-areas:'balance-trend_latest-records'_'spending-categories_latest-records']`,
          `md:grid-cols-2 md:[grid-template-areas:'balance-trend_balance-trend'_'spending-categories_latest-records']`,
          `grid-cols-1 [grid-template-areas:'balance-trend'_'spending-categories'_'latest-records']`,
        ]"
      >
        <BalanceTrendWidget :selected-period="currentPeriod" class="[grid-area:balance-trend]" />

        <SpendingCategoriesWidget :selected-period="currentPeriod" class="[grid-area:spending-categories]" />

        <LatestRecordsWidget class="[grid-area:latest-records] lg:max-w-[420px]" />
      </div>
    </template>
  </section>
</template>

<script lang="ts" setup>
import DashboardOnboarding from '@/components/widgets/dashboard-onboarding.vue';
import { useSafariDetection } from '@/composable/detect-safari';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/stores';
import { endOfMonth, parseISO, startOfMonth } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed, defineAsyncComponent, ref } from 'vue';
import { useRoute } from 'vue-router';

import PeriodSelector from './components/period-selector.vue';
import { type Period } from './types';

const BalanceTrendWidget = defineAsyncComponent(() => import('@/components/widgets/balance-trend.vue'));
const LatestRecordsWidget = defineAsyncComponent(() => import('@/components/widgets/latest-records.vue'));
const SpendingCategoriesWidget = defineAsyncComponent(() => import('@/components/widgets/expenses-structure.vue'));

const { isSafariMobile, isPWA } = useSafariDetection();

const route = useRoute();

const accountsStore = useAccountsStore();
const { accounts, isAccountsFetched } = storeToRefs(accountsStore);
const hasNoAccounts = computed(() => isAccountsFetched.value && accounts.value.length === 0);

defineOptions({
  name: 'page-dashboard',
});

// Get initial period from URL or default to current month
const getInitialPeriod = (): Period => {
  const { from, to } = route.query;
  if (from && to) {
    return {
      from: parseISO(from as string),
      to: parseISO(to as string),
    };
  }
  return {
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  };
};

const currentPeriod = ref<Period>(getInitialPeriod());
</script>
