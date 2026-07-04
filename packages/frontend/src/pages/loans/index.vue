<template>
  <PageWrapper>
    <div class="@container/loans-page mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <h1 class="text-3xl font-semibold tracking-tight">{{ $t('loans.title') }}</h1>

      <CreateLoanDialog>
        <UiButton>
          <PlusIcon class="size-4" />
          {{ $t('loans.addButton.label') }}
        </UiButton>
      </CreateLoanDialog>
    </div>

    <template v-if="loansQuery.isLoading.value">
      <Card class="mb-6">
        <CardContent class="p-6">
          <div class="bg-muted mb-3 h-3 w-24 animate-pulse rounded" />
          <div class="bg-muted mb-2 h-10 w-48 animate-pulse rounded" />
          <div class="bg-muted h-3 w-32 animate-pulse rounded" />
        </CardContent>
      </Card>
      <div class="border-border/60 divide-border/60 divide-y overflow-hidden rounded-xl border">
        <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-4 py-4">
          <div class="bg-muted size-9 animate-pulse rounded-lg" />
          <div class="flex-1 space-y-2">
            <div class="bg-muted h-4 w-32 animate-pulse rounded" />
            <div class="bg-muted h-3 w-24 animate-pulse rounded" />
          </div>
          <div class="bg-muted h-5 w-20 animate-pulse rounded" />
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
      <AggregateCard v-if="trackedLoans.length" class="mb-6" :loans="trackedLoans" />
      <LoanList v-if="activeLoans.length" :loans="activeLoans" />

      <section v-if="paidOffLoans.length" class="mt-8">
        <div class="mb-3 flex items-center gap-2 px-1">
          <h2 class="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
            {{ $t('loans.paidOff.sectionTitle') }}
          </h2>
          <span class="text-muted-foreground/70 text-xs font-medium tabular-nums">{{ paidOffLoans.length }}</span>
        </div>
        <PaidOffLoanList :loans="paidOffLoans" />
      </section>

      <section v-if="archivedLoans.length" class="mt-8">
        <Collapsible v-model:open="isArchivedOpen">
          <CollapsibleTrigger
            class="focus-visible:ring-ring/40 flex w-full items-center gap-2 rounded px-1 focus-visible:ring-2 focus-visible:outline-none"
          >
            <h2 class="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
              {{ $t('loans.archivedList.sectionTitle') }}
            </h2>
            <span class="text-muted-foreground/70 text-xs font-medium tabular-nums">{{ archivedLoans.length }}</span>
            <ChevronDownIcon
              class="text-muted-foreground size-3.5 transition-transform"
              :class="{ 'rotate-180': isArchivedOpen }"
            />
          </CollapsibleTrigger>
          <CollapsibleContent class="mt-3">
            <ArchivedLoanList :loans="archivedLoans" />
          </CollapsibleContent>
        </Collapsible>
      </section>
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
        <CreateLoanDialog>
          <UiButton size="lg">
            <PlusIcon class="size-4" />
            {{ $t('loans.empty.createFirstButton') }}
          </UiButton>
        </CreateLoanDialog>
      </div>
    </template>
  </PageWrapper>
</template>

<script setup lang="ts">
import PageWrapper from '@/components/common/page-wrapper.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent } from '@/components/lib/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { useLoans } from '@/composable/data-queries/loans';
import { ChevronDownIcon, HandCoinsIcon, PlusIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import AggregateCard from './components/aggregate-card.vue';
import ArchivedLoanList from './components/archived-loan-list.vue';
import CreateLoanDialog from './components/create-loan-dialog.vue';
import LoanList from './components/loan-list.vue';
import PaidOffLoanList from './components/paid-off-loan-list.vue';
import { partitionLoans } from './utils/partition-loans';

const loansQuery = useLoans();

const loans = computed(() => loansQuery.data.value ?? []);

const partitioned = computed(() => partitionLoans({ loans: loans.value }));

const activeLoans = computed(() => partitioned.value.active);

const paidOffLoans = computed(() => partitioned.value.paidOff);

const archivedLoans = computed(() => partitioned.value.archived);

// Aggregates read as "debts I track" — archived loans are excluded from every metric.
const trackedLoans = computed(() => [...activeLoans.value, ...paidOffLoans.value]);

const isArchivedOpen = ref(false);
</script>
