<template>
  <PageWrapper>
    <div class="mb-4">
      <UiButton variant="ghost" size="sm" class="-ml-2" @click="goBack">
        <ChevronLeftIcon class="mr-1 size-4" />
        {{ $t('loans.detail.backToList') }}
      </UiButton>
    </div>

    <template v-if="loanQuery.isLoading.value">
      <div class="@container/loans-detail grid grid-cols-1 gap-4 @lg/loans-detail:grid-cols-2">
        <Card v-for="i in 4" :key="i">
          <CardHeader>
            <div class="bg-muted h-5 w-32 animate-pulse rounded" />
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="bg-muted h-8 w-40 animate-pulse rounded" />
            <div class="bg-muted h-3 w-full animate-pulse rounded" />
            <div class="bg-muted h-3 w-2/3 animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    </template>

    <template v-else-if="loanQuery.error.value || !loan">
      <div class="py-12 text-center">
        <div class="text-destructive-text mb-4">{{ $t('loans.detail.loadError') }}</div>
        <UiButton @click="loanQuery.refetch()">{{ $t('loans.tryAgain') }}</UiButton>
      </div>
    </template>

    <template v-else>
      <div class="@container/loans-detail grid grid-cols-1 gap-4 @lg/loans-detail:grid-cols-2">
        <SummaryCard :loan="loan" />
        <ProjectionCard :loan="loan" />
        <EventsTimeline :events="loan.loanDetails.events" :currency-code="loan.currencyCode" />
        <RecentPayments :account-id="loan.id" :currency-code="loan.currencyCode" />
        <div class="@lg/loans-detail:col-span-2">
          <SettingsSection :loan="loan" />
        </div>
      </div>
    </template>
  </PageWrapper>
</template>

<script setup lang="ts">
import PageWrapper from '@/components/common/page-wrapper.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useLoanById } from '@/composable/data-queries/loans';
import { ROUTES_NAMES } from '@/routes';
import { ChevronLeftIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import EventsTimeline from './components/events-timeline.vue';
import ProjectionCard from './components/projection-card.vue';
import RecentPayments from './components/recent-payments.vue';
import SettingsSection from './components/settings-section.vue';
import SummaryCard from './components/summary-card.vue';

const route = useRoute();
const router = useRouter();

const loanId = computed(() => route.params.id as string);
const loanQuery = useLoanById({ id: loanId });

const loan = computed(() => loanQuery.data.value ?? null);

const goBack = () => {
  // Prefer browser back when the user navigated in from the list — keeps scroll
  // position. Fall back to the list route on direct deep-links.
  if (window.history.state?.back) {
    router.back();
  } else {
    router.push({ name: ROUTES_NAMES.loans });
  }
};
</script>
