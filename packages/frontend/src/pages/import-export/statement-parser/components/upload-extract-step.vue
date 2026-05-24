<template>
  <div class="space-y-6">
    <FileDropzone
      v-model="pickedFile"
      accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
      @error="(msg) => (fileError = msg)"
    >
      <template #hint>{{ $t('pages.statementParser.uploadExtract.supportedFormats') }}</template>
    </FileDropzone>

    <Callout v-if="fileError" variant="destructive">
      {{ fileError }}
    </Callout>

    <!-- Cost Estimate Section -->
    <div v-if="store.uploadedFile && !store.costEstimate && !store.estimateError" class="flex justify-center">
      <Button @click="handleEstimate" :disabled="store.isEstimating">
        <template v-if="store.isEstimating">
          <Loader2Icon class="mr-2 size-4 animate-spin" />
          {{ extractionStatus }}
        </template>
        <template v-else>
          <CalculatorIcon class="mr-2 size-4" />
          {{ $t('pages.statementParser.uploadExtract.analyzeButton') }}
        </template>
      </Button>
    </div>

    <Callout v-if="store.estimateError" variant="destructive">
      {{ store.estimateError }}
      <Button variant="ghost" size="sm" class="mt-2" @click="handleEstimate">
        {{ $t('pages.statementParser.uploadExtract.tryAgain') }}
      </Button>
    </Callout>

    <div v-if="store.costEstimate" class="space-y-4">
      <CostEstimateWarnings
        :estimated-input-tokens="store.costEstimate.estimatedInputTokens"
        :using-user-key="store.costEstimate.usingUserKey"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">{{ $t('pages.statementParser.uploadExtract.modelLabel') }}</p>
          <p class="font-medium">{{ store.costEstimate.modelName }}</p>
        </div>
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">
            {{ $t('pages.statementParser.uploadExtract.estimatedCostLabel') }}
          </p>
          <p class="font-medium">
            ${{ store.costEstimate.estimatedCostUsd.toFixed(4) }}
            <span v-if="store.costEstimate.usingUserKey" class="text-muted-foreground text-sm">
              {{ $t('pages.statementParser.uploadExtract.yourApiKey') }}
            </span>
          </p>
        </div>
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">
            {{ $t('pages.statementParser.uploadExtract.estimatedTokensLabel') }}
          </p>
          <p class="font-medium">
            {{
              t('pages.statementParser.uploadExtract.tokenFormat', {
                inputTokens: (store.costEstimate.estimatedInputTokens / 1000).toFixed(1),
                outputTokens: (store.costEstimate.estimatedOutputTokens / 1000).toFixed(1),
              })
            }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <Button class="flex-1" :disabled="store.isExtracting" @click="handleExtract">
          <template v-if="store.isExtracting">
            <Loader2Icon class="mr-2 size-4 animate-spin" />
            {{ extractionStatus }}
          </template>
          <template v-else>
            <SparklesIcon class="mr-2 size-4" />
            {{ $t('pages.statementParser.uploadExtract.extractButton') }}
          </template>
        </Button>
        <ApiKeySourceBadge :using-user-key="store.costEstimate.usingUserKey" />
      </div>

      <!-- Extraction Progress -->
      <div v-if="store.isExtracting" class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="bg-muted h-2 flex-1 overflow-hidden rounded-full">
            <div
              class="bg-primary h-full rounded-full transition-all duration-300 ease-out"
              :style="{ width: `${extractionProgress}%` }"
            />
          </div>
          <span class="text-muted-foreground w-10 text-right text-sm font-medium"> {{ extractionProgress }}% </span>
        </div>
        <p class="text-muted-foreground text-center text-xs">
          {{ $t('pages.statementParser.uploadExtract.progressMessage') }}
        </p>
      </div>
    </div>

    <Callout v-if="store.extractionError" variant="destructive">
      {{ store.extractionError }}
    </Callout>

    <!-- Extraction Results Preview -->
    <div v-if="store.extractionResult" class="space-y-4">
      <div class="bg-muted rounded-lg p-3">
        <p class="text-sm">
          <span class="text-muted-foreground">{{ $t('pages.statementParser.uploadExtract.foundLabel') }}</span>
          <span class="font-medium">
            {{ store.extractionResult.transactions.length }}
            {{ $t('pages.statementParser.uploadExtract.transactions') }}</span
          >
          <span v-if="store.extractionResult.metadata.bankName" class="ml-2">
            <span class="text-muted-foreground">{{ $t('pages.statementParser.uploadExtract.fromLabel') }}</span>
            {{ store.extractionResult.metadata.bankName }}
          </span>
          <span v-if="store.extractionResult.metadata.currencyCode" class="ml-2">
            <span class="text-muted-foreground">{{ $t('pages.statementParser.uploadExtract.inLabel') }}</span>
            {{ store.extractionResult.metadata.currencyCode }}
          </span>
        </p>
      </div>

      <p class="text-muted-foreground text-center text-sm">
        {{ $t('pages.statementParser.uploadExtract.continueMessage') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import ApiKeySourceBadge from '@/components/common/api-key-source-badge.vue';
import FileDropzone from '@/components/common/file-dropzone.vue';
import { Button } from '@/components/lib/ui/button';
import { Callout } from '@/components/lib/ui/callout';
import { useStatementParserStore } from '@/stores/statement-parser';
import { CalculatorIcon, Loader2Icon, SparklesIcon } from '@lucide/vue';
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { validateStatementFile } from '../utils/file-validation';
import CostEstimateWarnings from './cost-estimate-warnings.vue';

const { t } = useI18n();
const store = useStatementParserStore();

const fileError = ref<string | null>(null);
const extractionStatus = ref('Extracting...');
const extractionProgress = ref(0);

// Validation runs async, so we keep the dropzone reflecting the store's
// authoritative file (only updated after validation passes). The setter
// delegates to validateAndSetFile / store.reset.
const pickedFile = computed<File | null>({
  get: () => store.uploadedFile,
  set: (file) => {
    if (file === null) {
      store.reset();
      fileError.value = null;
      return;
    }
    void validateAndSetFile(file);
  },
});

let progressInterval: ReturnType<typeof setInterval> | null = null;
let statusTimeouts: ReturnType<typeof setTimeout>[] = [];

onUnmounted(() => {
  cleanupProgressAnimation();
});

function cleanupProgressAnimation() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  statusTimeouts.forEach(clearTimeout);
  statusTimeouts = [];
}

function startProgressAnimation() {
  extractionProgress.value = 0;
  const startTime = Date.now();

  progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;

    // Logarithmic progress curve that slows down over time.
    // Caps at 95% so we never claim done before the server says so.
    const progress = Math.min(95, 100 * (1 - Math.exp(-elapsed / 25)));
    extractionProgress.value = Math.round(progress);
  }, 200);
}

async function validateAndSetFile(file: File) {
  fileError.value = null;

  const validation = await validateStatementFile({ file });
  if (!validation.valid) {
    fileError.value = validation.error!;
    return;
  }

  await store.setFile({ file });
}

async function handleEstimate() {
  await store.estimateCost();
}

async function handleExtract() {
  extractionStatus.value = t('pages.statementParser.uploadExtract.status.sendingFile');
  startProgressAnimation();

  // AI extraction typically takes 20-60 seconds — show progressive status messages.
  const statusUpdates = [
    { delay: 3000, message: t('pages.statementParser.uploadExtract.status.readingDocument') },
    { delay: 8000, message: t('pages.statementParser.uploadExtract.status.analyzingStructure') },
    { delay: 15000, message: t('pages.statementParser.uploadExtract.status.extractingData') },
    { delay: 25000, message: t('pages.statementParser.uploadExtract.status.processingTransactions') },
    { delay: 40000, message: t('pages.statementParser.uploadExtract.status.finalizing') },
    { delay: 55000, message: t('pages.statementParser.uploadExtract.status.almostDone') },
  ];

  statusTimeouts = [];
  statusUpdates.forEach(({ delay, message }) => {
    statusTimeouts.push(
      setTimeout(() => {
        if (store.isExtracting) {
          extractionStatus.value = message;
        }
      }, delay),
    );
  });

  try {
    await store.extract();
    extractionProgress.value = 100;
  } finally {
    cleanupProgressAnimation();
  }
}
</script>
