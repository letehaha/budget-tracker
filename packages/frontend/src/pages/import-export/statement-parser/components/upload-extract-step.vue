<template>
  <div class="space-y-6">
    <MultiFileDropzone
      :model-value="selectedFiles"
      accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
      :max-size="MAX_FILE_SIZE"
      :validator="validateExtension"
      :disabled="isBusy"
      :idle-text="$t('pages.statementParser.uploadExtract.clickOrDragStatements')"
      @update:model-value="handleSelectionChange"
      @error="(msg) => (fileError = msg)"
    >
      <template #hint>{{ $t('pages.statementParser.uploadExtract.supportedFormats') }}</template>
    </MultiFileDropzone>

    <Callout v-if="fileError" variant="destructive">
      {{ fileError }}
    </Callout>

    <!-- Per-file progress. Visible from selection onwards so the state of every
         file in the batch is legible at a glance, not just the one in flight. -->
    <div v-if="fileRows.length" class="space-y-2">
      <p class="text-muted-foreground text-xs font-medium">
        {{ $t('pages.statementParser.uploadExtract.filesLabel') }}
      </p>
      <ul class="divide-border/60 overflow-hidden rounded-lg border">
        <li
          v-for="row in fileRows"
          :key="row.id"
          class="flex items-center justify-between gap-3 px-3 py-2 text-sm not-last:border-b"
        >
          <div class="flex min-w-0 items-center gap-2">
            <Loader2Icon v-if="row.busy" class="text-primary size-4 shrink-0 animate-spin" />
            <CheckCircleIcon v-else-if="row.state === 'extracted'" class="size-4 shrink-0 text-green-600" />
            <AlertCircleIcon v-else-if="row.failed" class="text-destructive-text size-4 shrink-0" />
            <FileTextIcon v-else class="text-muted-foreground size-4 shrink-0" />
            <span class="truncate">{{ row.name }}</span>
          </div>
          <span
            class="shrink-0 text-xs"
            :class="row.failed ? 'text-destructive-text' : 'text-muted-foreground'"
            :title="row.error ?? undefined"
          >
            {{ row.label }}
          </span>
        </li>
      </ul>
    </div>

    <!-- Cost Estimate Section -->
    <div v-if="pendingEstimateCount > 0 && !store.isExtracting" class="flex justify-center">
      <Button @click="handleEstimate" :disabled="store.isEstimating">
        <template v-if="store.isEstimating">
          <Loader2Icon class="size-4 animate-spin" />
          {{ $t('pages.statementParser.uploadExtract.analyzingFiles') }}
        </template>
        <template v-else>
          <CalculatorIcon class="size-4" />
          {{
            t(
              'pages.statementParser.uploadExtract.analyzeButton',
              { count: pendingEstimateCount },
              pendingEstimateCount,
            )
          }}
        </template>
      </Button>
    </div>

    <Callout v-if="store.estimateFailures.length" variant="destructive">
      {{
        t('pages.statementParser.uploadExtract.estimateFailedSome', {
          count: store.estimateFailures.length,
          total: store.fileEntries.length,
        })
      }}
      <ul class="mt-1 list-inside list-disc">
        <li v-for="entry in store.estimateFailures" :key="entry.id">
          {{ entry.file.name }} — {{ entry.estimateError }}
        </li>
      </ul>
    </Callout>

    <div v-if="totals" class="space-y-4">
      <CostEstimateWarnings
        :estimated-input-tokens="totals.estimatedInputTokens"
        :using-user-key="totals.usingUserKey"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">{{ $t('pages.statementParser.uploadExtract.modelLabel') }}</p>
          <p class="font-medium">{{ totals.modelName }}</p>
        </div>
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">
            {{ $t('pages.statementParser.uploadExtract.estimatedCostLabel') }}
          </p>
          <p class="font-medium">
            <AiEstimatedCost :estimate="totals" />
          </p>
          <p v-if="totals.fileCount > 1" class="text-muted-foreground mt-0.5 text-xs">
            {{ t('pages.statementParser.uploadExtract.totalForFiles', { count: totals.fileCount }) }}
          </p>
        </div>
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">
            {{ $t('pages.statementParser.uploadExtract.estimatedTokensLabel') }}
          </p>
          <p class="font-medium">
            {{
              t('pages.statementParser.uploadExtract.tokenFormat', {
                inputTokens: (totals.estimatedInputTokens / 1000).toFixed(1),
                outputTokens: (totals.estimatedOutputTokens / 1000).toFixed(1),
              })
            }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <Button class="flex-1" :disabled="store.isExtracting || !pendingExtractionCount" @click="handleExtract">
          <template v-if="store.isExtracting">
            <Loader2Icon class="size-4 animate-spin" />
            {{ extractionStatus }}
          </template>
          <template v-else>
            <SparklesIcon class="size-4" />
            {{ $t('pages.statementParser.uploadExtract.extractButton') }}
          </template>
        </Button>
        <ApiKeySourceBadge :using-user-key="totals.usingUserKey" />
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
          <template v-if="extractingPosition">
            {{
              t('pages.statementParser.uploadExtract.progressFile', {
                name: extractingPosition.name,
                current: extractingPosition.current,
                total: extractingPosition.total,
              })
            }}
          </template>
          <template v-else>{{ $t('pages.statementParser.uploadExtract.progressMessage') }}</template>
        </p>
      </div>
    </div>

    <Callout v-if="store.extractionFailures.length" variant="destructive">
      {{
        t('pages.statementParser.uploadExtract.extractionFailedSome', {
          count: store.extractionFailures.length,
          total: store.fileEntries.length,
        })
      }}
      <ul class="mt-1 list-inside list-disc">
        <li v-for="entry in store.extractionFailures" :key="entry.id">
          {{ entry.file.name }} — {{ entry.extractionError }}
        </li>
      </ul>
      <Button v-if="!store.isExtracting" variant="ghost" size="sm" class="mt-2" @click="handleRetryFailed">
        {{ $t('pages.statementParser.uploadExtract.retryFailed') }}
      </Button>
    </Callout>

    <!-- Extraction Results Preview -->
    <div v-if="store.mergedTransactions.length" class="space-y-4">
      <div class="bg-muted rounded-lg p-3">
        <p class="text-sm">
          <span class="text-muted-foreground">{{ $t('pages.statementParser.uploadExtract.foundLabel') }}</span>
          <span class="font-medium">
            {{ store.mergedTransactions.length }}
            {{ $t('pages.statementParser.uploadExtract.transactions') }}</span
          >
          <span v-if="store.importSummary.files > 1" class="ml-1">
            {{ t('pages.statementParser.uploadExtract.acrossFiles', { count: store.importSummary.files }) }}
          </span>
          <span v-if="store.detectedBankName" class="ml-2">
            <span class="text-muted-foreground">{{ $t('pages.statementParser.uploadExtract.fromLabel') }}</span>
            {{ store.detectedBankName }}
          </span>
          <span v-if="store.detectedCurrency" class="ml-2">
            <span class="text-muted-foreground">{{ $t('pages.statementParser.uploadExtract.inLabel') }}</span>
            {{ store.detectedCurrency }}
          </span>
        </p>
      </div>

      <Callout v-if="droppedRowCount > 0" variant="warning">
        {{ $t('pages.statementParser.droppedRowsWarning', { count: droppedRowCount }) }}
      </Callout>

      <Callout v-if="store.hasCurrencyConflict" variant="warning">
        {{
          t('pages.statementParser.uploadExtract.currencyConflict', {
            currencies: store.detectedCurrencies.join(', '),
          })
        }}
      </Callout>

      <p class="text-muted-foreground text-center text-sm">
        {{ $t('pages.statementParser.uploadExtract.continueMessage') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import AiEstimatedCost from '@/components/common/ai-estimated-cost.vue';
import ApiKeySourceBadge from '@/components/common/api-key-source-badge.vue';
import { MultiFileDropzone } from '@/components/common/dropzone';
import { Button } from '@/components/lib/ui/button';
import { Callout } from '@/components/lib/ui/callout';
import { type StatementFileEntry, useStatementParserStore } from '@/stores/statement-parser';
import { AlertCircleIcon, CalculatorIcon, CheckCircleIcon, FileTextIcon, Loader2Icon, SparklesIcon } from '@lucide/vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { MAX_FILE_SIZE, SUPPORTED_EXTENSIONS, validateStatementFile } from '../utils/file-validation';
import CostEstimateWarnings from './cost-estimate-warnings.vue';

const { t } = useI18n();
const store = useStatementParserStore();

/**
 * Mirror of the store's selection, kept locally so the dropzone lists exactly
 * what the user picked. It only ever holds files that passed validation — the
 * store is set from the same list, so the two can't drift.
 */
const selectedFiles = ref<File[]>([]);
const fileError = ref('');
const extractionStatus = ref('');
/** Progress within the file currently being extracted, 0-100. */
const fileProgress = ref(0);

const isBusy = computed(() => store.isEstimating || store.isExtracting);
const totals = computed(() => store.costEstimateTotals);
const droppedRowCount = computed(() => store.droppedRowCount);

const pendingEstimateCount = computed(() => store.pendingEstimateEntries.length);
const pendingExtractionCount = computed(() => store.extractableEntries.length);

type FileRowState = 'pending' | 'estimating' | 'estimated' | 'estimateFailed' | 'extracting' | 'extracted' | 'failed';

/** Flattens each entry's estimate/extraction outcome into one displayable state. */
function rowState(entry: StatementFileEntry): FileRowState {
  if (entry.extraction) return 'extracted';
  if (entry.extractionError) return 'failed';
  if (store.extractingFileId === entry.id) return 'extracting';
  if (entry.estimateError) return 'estimateFailed';
  if (store.estimatingFileId === entry.id) return 'estimating';
  if (entry.costEstimate) return 'estimated';
  return 'pending';
}

const fileRows = computed(() =>
  store.fileEntries.map((entry) => {
    const state = rowState(entry);
    return {
      id: entry.id,
      name: entry.file.name,
      state,
      busy: state === 'estimating' || state === 'extracting',
      failed: state === 'failed' || state === 'estimateFailed',
      error: entry.extractionError ?? entry.estimateError,
      label:
        state === 'extracted'
          ? t(
              'pages.statementParser.uploadExtract.fileStatus.extracted',
              { count: entry.extraction!.transactions.length },
              entry.extraction!.transactions.length,
            )
          : t(`pages.statementParser.uploadExtract.fileStatus.${state}`),
    };
  }),
);

/** Position of the file being extracted, for the "3 of 5" progress caption. */
const extractingPosition = computed(() => {
  const index = store.fileEntries.findIndex((entry) => entry.id === store.extractingFileId);
  if (index === -1) return null;
  return {
    name: store.fileEntries[index]!.file.name,
    current: index + 1,
    total: store.fileEntries.length,
  };
});

/**
 * Overall progress across the batch: files already settled contribute a whole
 * slice each, and the file in flight contributes its own animated fraction of one.
 */
const extractionProgress = computed(() => {
  const total = store.fileEntries.length;
  if (!total) return 0;
  const settled = store.fileEntries.filter((entry) => entry.extraction || entry.extractionError).length;
  const inFlight = store.isExtracting ? fileProgress.value / 100 : 0;
  return Math.min(100, Math.round(((settled + inFlight) / total) * 100));
});

let progressInterval: ReturnType<typeof setInterval> | null = null;
let statusTimeouts: ReturnType<typeof setTimeout>[] = [];

// The animation is driven by which file is in flight rather than by handleExtract,
// so each file in the batch gets its own curve and status schedule.
watch(
  () => store.extractingFileId,
  (fileId) => {
    cleanupProgressAnimation();
    fileProgress.value = 0;
    if (!fileId) return;
    extractionStatus.value = t('pages.statementParser.uploadExtract.status.sendingFile');
    startProgressAnimation();
    scheduleStatusMessages();
  },
);

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
  fileProgress.value = 0;
  const startTime = Date.now();

  progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;

    // Logarithmic progress curve that slows down over time.
    // Caps at 95% so we never claim done before the server says so.
    fileProgress.value = Math.min(95, 100 * (1 - Math.exp(-elapsed / 25)));
  }, 200);
}

function scheduleStatusMessages() {
  // AI extraction typically takes 20-60 seconds per file — show progressive status messages.
  const statusUpdates = [
    { delay: 3000, message: t('pages.statementParser.uploadExtract.status.readingDocument') },
    { delay: 8000, message: t('pages.statementParser.uploadExtract.status.analyzingStructure') },
    { delay: 15000, message: t('pages.statementParser.uploadExtract.status.extractingData') },
    { delay: 25000, message: t('pages.statementParser.uploadExtract.status.processingTransactions') },
    { delay: 40000, message: t('pages.statementParser.uploadExtract.status.finalizing') },
    { delay: 55000, message: t('pages.statementParser.uploadExtract.status.almostDone') },
  ];

  statusTimeouts = statusUpdates.map(({ delay, message }) =>
    setTimeout(() => {
      if (store.isExtracting) extractionStatus.value = message;
    }, delay),
  );
}

/**
 * Cheap synchronous gate the dropzone can apply while building its selection.
 * The magic-byte check in `validateStatementFile` is async, so it can't run here
 * and instead runs over the resulting selection in `handleSelectionChange`.
 */
function validateExtension(file: File): string | null {
  const ext = '.' + (file.name.toLowerCase().split('.').pop() || '');
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return t('pages.statementParser.uploadExtract.unsupportedFileNamed', { name: file.name });
  }
  return null;
}

async function handleSelectionChange(files: File[]) {
  const accepted: File[] = [];
  const rejections: string[] = [];

  for (const file of files) {
    const validation = await validateStatementFile({ file });
    if (validation.valid) accepted.push(file);
    else rejections.push(`${file.name} — ${validation.error!}`);
  }

  selectedFiles.value = accepted;

  const { unreadable } = await store.setFiles({ files: accepted });
  if (unreadable.length) {
    rejections.push(t('pages.statementParser.uploadExtract.unreadableFiles', { files: unreadable.join(', ') }));
  }

  // Only overwrite on a rejection: the dropzone has already cleared its own
  // message for this selection, and a removal emits no message at all.
  if (rejections.length) fileError.value = rejections.join(' · ');
}

async function handleEstimate() {
  await store.estimateCosts();
}

async function handleExtract() {
  try {
    await store.extractAll();
  } finally {
    cleanupProgressAnimation();
  }
}

/**
 * Re-runs extraction after clearing the recorded failures. `extractAll` skips
 * files that already parsed, so this only re-spends on the ones that failed.
 */
async function handleRetryFailed() {
  store.clearFailures();
  await handleExtract();
}
</script>
