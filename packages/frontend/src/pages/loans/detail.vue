<template>
  <PageWrapper>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <UiButton variant="ghost" size="sm" class="-ml-2" @click="goBack">
        <ChevronLeftIcon class="mr-1 size-4" />
        {{ $t('loans.detail.backToList') }}
      </UiButton>
      <div v-if="loan" class="flex items-center gap-2">
        <RecordPaymentButton :loan="loan" />
        <LoanActionsMenu :loan="loan" />
      </div>
    </div>

    <template v-if="loanQuery.isLoading.value">
      <div class="@container/loans-detail grid grid-cols-1 gap-4 @3xl/loans-detail:grid-cols-2">
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
      <div ref="gridContainerRef">
        <!-- Wide layout: `items-start` keeps the right column at natural height instead of stretching to the chart. -->
        <div v-if="!isCompact" class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-4">
            <SummaryCard :loan="loan" />
            <ProjectionCard :loan="loan" />
          </div>
          <div class="grid grid-cols-2 items-start gap-4">
            <Card>
              <!-- Chart owns its header so the title shares a row with the custom-payment field. -->
              <CardContent class="pt-2 sm:pt-6">
                <PayoffProjectionChart :loan="loan" with-title />
              </CardContent>
            </Card>
            <div class="flex flex-col gap-4">
              <RecentPayments :loan="loan" />
              <EventsTimeline :events="loan.loanDetails.events" :currency-code="loan.currencyCode" />
            </div>
          </div>
        </div>

        <!-- Narrow layout: projection and chart share one card, chart tucked into a collapsible section. -->
        <div v-else class="grid grid-cols-1 gap-4">
          <SummaryCard :loan="loan" />
          <Card>
            <CardHeader class="pb-3">
              <div class="text-base font-semibold">{{ $t('loans.detail.projection.title') }}</div>
            </CardHeader>
            <CardContent class="space-y-4">
              <ProjectionCardContent :loan="loan" />
              <Collapsible v-model:open="isChartOpen">
                <CollapsibleTrigger class="flex w-full items-center justify-between border-t pt-4 text-sm font-medium">
                  <span class="flex items-center gap-1.5">
                    {{ $t('loans.detail.payoffChart.title') }}
                    <HintIcon :content="$t('loans.detail.payoffChart.titleHint')" />
                  </span>
                  <ChevronDownIcon class="size-4 transition-transform" :class="{ 'rotate-180': isChartOpen }" />
                </CollapsibleTrigger>
                <CollapsibleContent class="pt-4">
                  <PayoffProjectionChart :loan="loan" />
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
          <RecentPayments :loan="loan" />
          <EventsTimeline :events="loan.loanDetails.events" :currency-code="loan.currencyCode" />
        </div>
      </div>
    </template>
  </PageWrapper>
</template>

<script setup lang="ts">
import HintIcon from '@/components/common/hint-icon.vue';
import PageWrapper from '@/components/common/page-wrapper.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { useLoanById } from '@/composable/data-queries/loans';
import { ROUTES_NAMES } from '@/routes';
import { useElementSize } from '@vueuse/core';
import { ChevronDownIcon, ChevronLeftIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import EventsTimeline from './components/events-timeline.vue';
import LoanActionsMenu from './components/loan-actions-menu.vue';
import PayoffProjectionChart from './components/payoff-projection-chart.vue';
import ProjectionCard from './components/projection-card.vue';
import ProjectionCardContent from './components/projection-card-content.vue';
import RecentPayments from './components/recent-payments.vue';
import RecordPaymentButton from './components/record-payment-button.vue';
import SummaryCard from './components/summary-card.vue';

const route = useRoute();
const router = useRouter();

const loanId = computed(() => route.params.id as string);
const loanQuery = useLoanById({ id: loanId });

const loan = computed(() => loanQuery.data.value ?? null);

// Restructuring (merge + reorder cards) below this width can't be expressed in pure CSS, so JS-measured
// width drives the switch. The loading skeleton uses a CSS `@3xl/loans-detail` query for the same 768px —
// keep both in sync if this changes.
const TWO_COLUMN_MIN_WIDTH_PX = 768;

const gridContainerRef = ref<HTMLDivElement | null>(null);
const { width: gridWidth } = useElementSize(gridContainerRef);
// Treat unmeasured (0) as wide so desktop users don't see a layout flash.
const isCompact = computed(() => gridWidth.value > 0 && gridWidth.value < TWO_COLUMN_MIN_WIDTH_PX);

const isChartOpen = ref(false);

const goBack = () => {
  // Prefer browser back (keeps scroll position); fall back to the list route on direct deep-links.
  if (window.history.state?.back) {
    router.back();
  } else {
    router.push({ name: ROUTES_NAMES.loans });
  }
};
</script>
