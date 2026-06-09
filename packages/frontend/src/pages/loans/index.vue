<template>
  <PageWrapper>
    <div class="@container/loans-page mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-2xl tracking-wider">{{ $t('loans.title') }}</h1>

      <DesktopOnlyTooltip :content="$t('loans.addButton.notYet')">
        <span class="inline-flex">
          <UiButton disabled>
            <PlusIcon class="mr-2 size-4" />
            {{ $t('loans.addButton.label') }}
          </UiButton>
        </span>
      </DesktopOnlyTooltip>
    </div>

    <template v-if="loansQuery.isLoading.value">
      <div class="space-y-3">
        <Card>
          <CardContent class="p-4">
            <div class="bg-muted mb-2 h-6 w-32 animate-pulse rounded" />
            <div class="bg-muted h-8 w-40 animate-pulse rounded" />
          </CardContent>
        </Card>
        <div class="@container/loans-list grid grid-cols-1 gap-4 @md/loans-list:grid-cols-2 @xl/loans-list:grid-cols-3">
          <Card v-for="i in 3" :key="i">
            <CardHeader class="pb-2">
              <div class="bg-muted h-5 w-32 animate-pulse rounded" />
              <div class="bg-muted mt-1.5 h-3 w-20 animate-pulse rounded" />
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="bg-muted h-7 w-28 animate-pulse rounded" />
              <div class="bg-muted h-1.5 w-full animate-pulse rounded" />
              <div class="bg-muted h-3 w-24 animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>
      </div>
    </template>

    <template v-else-if="loansQuery.error.value">
      <div class="py-12 text-center">
        <div class="text-destructive-text mb-4">{{ $t('loans.loadError') }}</div>
        <UiButton @click="loansQuery.refetch()">{{ $t('loans.tryAgain') }}</UiButton>
      </div>
    </template>

    <template v-else-if="loans.length">
      <AggregateCard class="mb-6" :total-liabilities="totalLiabilities" :count="loans.length" />
      <div class="@container/loans-list grid grid-cols-1 gap-4 @md/loans-list:grid-cols-2 @xl/loans-list:grid-cols-3">
        <LoanCard v-for="loan in loans" :key="loan.id" :loan="loan" />
      </div>
    </template>

    <template v-else>
      <div class="py-16 text-center">
        <div class="mb-6">
          <div class="bg-muted mx-auto mb-4 flex size-16 items-center justify-center rounded-full">
            <HandCoinsIcon class="text-muted-foreground size-8" />
          </div>
          <h3 class="text-foreground mb-2 text-xl font-semibold">{{ $t('loans.empty.title') }}</h3>
          <p class="text-muted-foreground mx-auto max-w-md text-base">
            {{ $t('loans.empty.description') }}
          </p>
        </div>
        <DesktopOnlyTooltip :content="$t('loans.addButton.notYet')">
          <span class="inline-flex">
            <UiButton size="lg" disabled>
              <PlusIcon class="mr-2 size-4" />
              {{ $t('loans.empty.createFirstButton') }}
            </UiButton>
          </span>
        </DesktopOnlyTooltip>
      </div>
    </template>
  </PageWrapper>
</template>

<script setup lang="ts">
import PageWrapper from '@/components/common/page-wrapper.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useLoans } from '@/composable/data-queries/loans';
import { HandCoinsIcon, PlusIcon } from '@lucide/vue';
import { computed } from 'vue';

import AggregateCard from './components/aggregate-card.vue';
import LoanCard from './components/loan-card.vue';

const loansQuery = useLoans();

const loans = computed(() => loansQuery.data.value ?? []);

const totalLiabilities = computed(() => loans.value.reduce((acc, loan) => acc + Math.abs(loan.refCurrentBalance), 0));
</script>
