<script setup lang="ts">
import BackLink from '@/components/common/back-link.vue';
import PageWrapper from '@/components/common/page-wrapper.vue';
import ResourceNotFound from '@/components/common/resource-not-found.vue';
import { usePortfolio } from '@/composable/data-queries/portfolios';
import { isResourceMissingError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import type { InvestmentImportHolding } from '@bt/shared/types/investments';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ReviewStep from './review-step.vue';
import UploadStep from './upload-step.vue';

const route = useRoute();
const router = useRouter();

const portfolioId = computed(() => String(route.params.portfolioId));

const { data: portfolio, isLoading, isError, error } = usePortfolio(portfolioId, { retry: false });

const isNotFound = computed(() => isError.value && isResourceMissingError(error.value));

type Step = 'upload' | 'review';
const step = ref<Step>('upload');

const extractedHoldings = ref<InvestmentImportHolding[]>([]);
const extractedWarnings = ref<string[]>([]);

function onExtracted(payload: { holdings: InvestmentImportHolding[]; warnings: string[] }) {
  extractedHoldings.value = payload.holdings;
  extractedWarnings.value = payload.warnings;
  step.value = 'review';
}

function goBackToUpload() {
  step.value = 'upload';
}

function onImported() {
  router.push({ name: ROUTES_NAMES.portfolioDetail, params: { portfolioId: portfolioId.value } });
}
</script>

<template>
  <PageWrapper class="pt-4">
    <BackLink :to="{ name: ROUTES_NAMES.portfolioDetail, params: { portfolioId } }">
      {{ $t('investmentsImport.backToPortfolio') }}
    </BackLink>

    <div class="mb-6">
      <h1 class="text-2xl tracking-wider">{{ $t('investmentsImport.title') }}</h1>
      <p class="text-muted-foreground mt-2 text-sm sm:text-base">
        {{ $t('investmentsImport.description') }}
      </p>
    </div>

    <div class="@container/import max-w-5xl">
      <!-- Loading skeleton — approximates the upload card shape -->
      <div v-if="isLoading" class="rounded-xl border p-5">
        <div class="bg-muted mb-5 h-11 w-full animate-pulse rounded-full" />
        <div class="bg-muted mb-5 h-40 w-full animate-pulse rounded-xl" />
        <div class="flex justify-end gap-2">
          <div class="bg-muted h-9 w-28 animate-pulse rounded-md" />
          <div class="bg-muted h-9 w-28 animate-pulse rounded-md" />
        </div>
      </div>

      <!-- Portfolio missing or no access -->
      <ResourceNotFound
        v-else-if="isNotFound"
        :title="$t('portfolioDetail.notFoundTitle')"
        :description="$t('portfolioDetail.notFoundDescription')"
        :link-label="$t('portfolioDetail.backToInvestments')"
        :link-to="{ name: ROUTES_NAMES.investments }"
      />

      <!-- Other error (network, server) -->
      <div v-else-if="isError" class="text-destructive-text rounded-lg border border-dashed p-6 text-center text-sm">
        {{ $t('portfolioDetail.loadError') }}
      </div>

      <!-- Happy path -->
      <template v-else-if="portfolio">
        <UploadStep v-if="step === 'upload'" :portfolio-id="portfolioId" @extracted="onExtracted" />
        <ReviewStep
          v-else
          :portfolio-id="portfolioId"
          :initial-holdings="extractedHoldings"
          :initial-warnings="extractedWarnings"
          @back="goBackToUpload"
          @imported="onImported"
        />
      </template>
    </div>
  </PageWrapper>
</template>
