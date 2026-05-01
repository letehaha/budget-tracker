<script setup lang="ts">
import BackLink from '@/components/common/back-link.vue';
import PageWrapper from '@/components/common/page-wrapper.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { trackAnalyticsEvent } from '@/lib/posthog';
import type { CashFlowDuplicateMatch, CashFlowExecuteResponse, ExtractedCashFlowRow } from '@bt/shared/types';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import InputStep from './components/input-step.vue';
import ResultsStep from './components/results-step.vue';
import ReviewStep from './components/review-step.vue';

type WizardState =
  | { step: 'input' }
  | {
      step: 'review';
      rows: ExtractedCashFlowRow[];
      duplicates: CashFlowDuplicateMatch[];
      modelName: string;
    }
  | { step: 'results'; result: CashFlowExecuteResponse };

const route = useRoute();
const portfolioId = Number(route.params.portfolioId);

const state = ref<WizardState>({ step: 'input' });

onMounted(() => {
  trackAnalyticsEvent({
    event: 'import_opened',
    properties: { import_type: 'portfolio_cash_flow' },
  });
});

const handleParsed = ({
  rows,
  duplicates,
  modelName,
}: {
  rows: ExtractedCashFlowRow[];
  duplicates: CashFlowDuplicateMatch[];
  modelName: string;
}) => {
  state.value = { step: 'review', rows, duplicates, modelName };
};

const handleImported = (result: CashFlowExecuteResponse) => {
  state.value = { step: 'results', result };
};

const handleBack = () => {
  state.value = { step: 'input' };
};

const handleStartOver = () => {
  state.value = { step: 'input' };
};
</script>

<template>
  <PageWrapper class="pt-4">
    <BackLink :to="{ name: ROUTES_NAMES.portfolioDetail, params: { portfolioId } }">
      {{ $t('portfolioCashFlowImport.backToPortfolio') }}
    </BackLink>

    <div class="mb-6">
      <h1 class="text-2xl tracking-wider">{{ $t('portfolioCashFlowImport.pageTitle') }}</h1>
      <p class="text-muted-foreground mt-2">
        {{ $t('portfolioCashFlowImport.pageDescription') }}
      </p>
    </div>

    <div class="bg-card max-w-4xl rounded-lg border p-6">
      <InputStep v-if="state.step === 'input'" :portfolio-id="portfolioId" @parsed="handleParsed" />
      <ReviewStep
        v-else-if="state.step === 'review'"
        :portfolio-id="portfolioId"
        :rows="state.rows"
        :duplicates="state.duplicates"
        :model-name="state.modelName"
        @imported="handleImported"
        @back="handleBack"
      />
      <ResultsStep v-else :portfolio-id="portfolioId" :result="state.result" @start-over="handleStartOver" />
    </div>
  </PageWrapper>
</template>
