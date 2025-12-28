<template>
  <div class="space-y-6">
    <!-- File Upload Area -->
    <div
      class="rounded-lg border-2 border-dashed p-8 text-center transition-colors"
      :class="{
        'border-primary bg-primary/5': isDragging,
        'border-muted-foreground/30 hover:border-primary/50': !isDragging,
      }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
        class="hidden"
        @change="handleFileSelect"
      />

      <div v-if="!store.uploadedFile" class="space-y-4">
        <FileIcon class="text-muted-foreground mx-auto size-12" />
        <div>
          <p class="text-muted-foreground">Drag and drop your statement file here, or</p>
          <Button variant="outline" class="mt-2" @click="fileInput?.click()"> Browse Files </Button>
        </div>
        <p class="text-muted-foreground text-sm">Supported formats: PDF, CSV, TXT (max 10MB)</p>
      </div>

      <div v-else class="space-y-2">
        <component :is="getFileIcon()" class="text-primary mx-auto size-12" />
        <p class="font-medium">{{ store.uploadedFile.name }}</p>
        <p class="text-muted-foreground text-sm">{{ (store.uploadedFile.size / 1024).toFixed(1) }} KB</p>
        <Button variant="ghost-destructive" size="sm" @click="clearFile">
          <XIcon class="mr-1 size-4" />
          Remove
        </Button>
      </div>
    </div>

    <div v-if="fileError" class="bg-destructive/10 text-destructive-text rounded-lg p-3">
      {{ fileError }}
    </div>

    <!-- Cost Estimate Section -->
    <div v-if="store.uploadedFile && !store.costEstimate && !store.estimateError" class="flex justify-center">
      <Button @click="handleEstimate" :disabled="store.isEstimating">
        <template v-if="store.isEstimating">
          <Loader2Icon class="mr-2 size-4 animate-spin" />
          Analyzing file...
        </template>
        <template v-else>
          <CalculatorIcon class="mr-2 size-4" />
          Analyze File
        </template>
      </Button>
    </div>

    <div v-if="store.estimateError" class="bg-destructive/10 text-destructive-text rounded-lg p-3">
      {{ store.estimateError }}
      <Button variant="ghost" size="sm" class="mt-2" @click="handleEstimate"> Try Again </Button>
    </div>

    <div v-if="store.costEstimate" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">Model</p>
          <p class="font-medium">{{ store.costEstimate.modelName }}</p>
        </div>
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">Estimated Cost</p>
          <p class="font-medium">
            ${{ store.costEstimate.estimatedCostUsd.toFixed(4) }}
            <span v-if="store.costEstimate.usingUserKey" class="text-muted-foreground text-sm"> (your API key) </span>
          </p>
        </div>
        <div class="bg-muted rounded-lg p-3">
          <p class="text-muted-foreground text-sm">Estimated Tokens</p>
          <p class="font-medium">
            ~{{ (store.costEstimate.estimatedInputTokens / 1000).toFixed(1) }}K input, ~{{
              (store.costEstimate.estimatedOutputTokens / 1000).toFixed(1)
            }}K output
          </p>
        </div>
      </div>

      <Button class="w-full" :disabled="store.isExtracting" @click="handleExtract">
        <template v-if="store.isExtracting">
          <Loader2Icon class="mr-2 size-4 animate-spin" />
          {{ extractionStatus }}
        </template>
        <template v-else>
          <SparklesIcon class="mr-2 size-4" />
          Extract Transactions
        </template>
      </Button>

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
          This may take 30-60 seconds depending on the document size
        </p>
      </div>
    </div>

    <div v-if="store.extractionError" class="bg-destructive/10 text-destructive-text rounded-lg p-3">
      {{ store.extractionError }}
    </div>

    <!-- Extraction Results Preview -->
    <div v-if="store.extractionResult" class="space-y-4">
      <div class="bg-muted rounded-lg p-3">
        <p class="text-sm">
          <span class="text-muted-foreground">Found:</span>
          <span class="font-medium"> {{ store.extractionResult.transactions.length }} transactions</span>
          <span v-if="store.extractionResult.metadata.bankName" class="ml-2">
            <span class="text-muted-foreground">from</span>
            {{ store.extractionResult.metadata.bankName }}
          </span>
          <span v-if="store.extractionResult.metadata.currencyCode" class="ml-2">
            <span class="text-muted-foreground">in</span>
            {{ store.extractionResult.metadata.currencyCode }}
          </span>
        </p>
      </div>

      <p class="text-muted-foreground text-center text-sm">Continue to select an account for these transactions.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { useStatementParserStore } from '@/stores/statement-parser';
import {
  CalculatorIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  XIcon,
} from 'lucide-vue-next';
import { onUnmounted, ref } from 'vue';

import { validateStatementFile } from '../utils/file-validation';

const store = useStatementParserStore();

const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const fileError = ref<string | null>(null);
const extractionStatus = ref('Extracting...');
const extractionProgress = ref(0);

// Progress animation interval
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

  // Expected duration ~60s, but we'll cap progress at 95% until complete
  // Progress curve: fast at start, slower as it progresses
  progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000; // seconds

    // Logarithmic progress curve that slows down over time
    // Reaches ~50% at 15s, ~70% at 30s, ~85% at 45s, ~92% at 60s
    // Never exceeds 95% until extraction completes
    const progress = Math.min(95, 100 * (1 - Math.exp(-elapsed / 25)));
    extractionProgress.value = Math.round(progress);
  }, 200);
}

function getFileIcon() {
  if (!store.uploadedFile) return FileIcon;
  const ext = store.uploadedFile.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return FileTextIcon;
  if (ext === 'csv') return FileSpreadsheetIcon;
  return FileTextIcon;
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) {
    validateAndSetFile(input.files[0]);
  }
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) {
    validateAndSetFile(file);
  }
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

function clearFile() {
  store.reset();
  fileError.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

async function handleEstimate() {
  await store.estimateCost();
}

async function handleExtract() {
  extractionStatus.value = 'Sending file to AI...';
  startProgressAnimation();

  // Status updates with extended timings for AI processing
  // AI extraction typically takes 20-60 seconds
  const statusUpdates = [
    { delay: 3000, message: 'AI is reading the document...' },
    { delay: 8000, message: 'Analyzing statement structure...' },
    { delay: 15000, message: 'Extracting transaction data...' },
    { delay: 25000, message: 'Processing transactions...' },
    { delay: 40000, message: 'Finalizing extraction...' },
    { delay: 55000, message: 'Almost done...' },
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
    // On success, jump to 100%
    extractionProgress.value = 100;
  } finally {
    cleanupProgressAnimation();
  }
}
</script>
