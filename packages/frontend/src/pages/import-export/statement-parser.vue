<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl tracking-wider">Statement Parser</h1>
      <p class="text-muted-foreground mt-2">
        Upload a bank statement (PDF, CSV, or TXT) to extract transactions using AI. Requires an AI API key configured
        in settings.
      </p>
    </div>

    <div class="max-w-4xl space-y-6">
      <!-- Step 1: Upload File -->
      <div class="bg-card rounded-lg border p-6">
        <h2 class="mb-4 text-lg font-semibold">1. Upload Statement File</h2>

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

          <div v-if="!selectedFile" class="space-y-4">
            <FileIcon class="text-muted-foreground mx-auto size-12" />
            <div>
              <p class="text-muted-foreground">Drag and drop your statement file here, or</p>
              <Button variant="outline" class="mt-2" @click="fileInput?.click()"> Browse Files </Button>
            </div>
            <p class="text-muted-foreground text-sm">Supported formats: PDF, CSV, TXT (max 10MB)</p>
          </div>

          <div v-else class="space-y-2">
            <component :is="getFileIcon()" class="text-primary mx-auto size-12" />
            <p class="font-medium">{{ selectedFile.name }}</p>
            <p class="text-muted-foreground text-sm">
              {{ (selectedFile.size / 1024).toFixed(1) }} KB
              <span v-if="detectedFileType" class="ml-2">({{ detectedFileType.toUpperCase() }})</span>
            </p>
            <Button variant="ghost" size="sm" @click="clearFile">
              <XIcon class="mr-1 size-4" />
              Remove
            </Button>
          </div>
        </div>

        <div v-if="fileError" class="bg-destructive/10 text-destructive mt-4 rounded-lg p-3">
          {{ fileError }}
        </div>
      </div>

      <!-- Step 2: Cost Estimate -->
      <div v-if="selectedFile" class="bg-card rounded-lg border p-6">
        <h2 class="mb-4 text-lg font-semibold">2. Cost Estimate</h2>

        <div v-if="isEstimating" class="flex items-center gap-2">
          <Loader2Icon class="size-4 animate-spin" />
          <span>Analyzing file...</span>
        </div>

        <div v-else-if="estimateError" class="bg-destructive/10 text-destructive rounded-lg p-3">
          {{ estimateError }}
        </div>

        <div v-else-if="costEstimate" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="bg-muted rounded-lg p-3">
              <p class="text-muted-foreground text-sm">Model</p>
              <p class="font-medium">{{ costEstimate.modelName }}</p>
            </div>
            <div class="bg-muted rounded-lg p-3">
              <p class="text-muted-foreground text-sm">Estimated Cost</p>
              <p class="font-medium">
                ${{ costEstimate.estimatedCostUsd.toFixed(4) }}
                <span v-if="costEstimate.usingUserKey" class="text-muted-foreground text-sm"> (your API key) </span>
              </p>
            </div>
            <div class="bg-muted rounded-lg p-3">
              <p class="text-muted-foreground text-sm">File Type</p>
              <p class="font-medium">{{ costEstimate.fileType.toUpperCase() }}</p>
            </div>
            <div class="bg-muted rounded-lg p-3">
              <p class="text-muted-foreground text-sm">Estimated Tokens</p>
              <p class="font-medium">
                ~{{ (costEstimate.estimatedInputTokens / 1000).toFixed(1) }}K input, ~{{
                  (costEstimate.estimatedOutputTokens / 1000).toFixed(1)
                }}K output
              </p>
            </div>
          </div>

          <!-- Token limit info -->
          <div v-if="costEstimate.tokenLimit" class="bg-muted/50 rounded-lg p-3 text-sm">
            <p>
              <span class="text-muted-foreground">Token limit:</span>
              {{ (costEstimate.tokenLimit.maxInputTokens / 1000).toFixed(0) }}K tokens (model context / 3)
            </p>
          </div>

          <Button class="w-full" :disabled="isExtracting" @click="extractTransactions">
            <template v-if="isExtracting">
              <Loader2Icon class="mr-2 size-4 animate-spin" />
              Extracting...
            </template>
            <template v-else>
              <SparklesIcon class="mr-2 size-4" />
              Extract Transactions
            </template>
          </Button>

          <!-- Extraction Progress -->
          <div v-if="isExtracting" class="mt-4 space-y-3">
            <div class="flex items-center gap-3">
              <div class="relative size-5">
                <Loader2Icon class="text-primary size-5 animate-spin" />
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium">{{ extractionStatus }}</p>
                <p class="text-muted-foreground text-xs">This may take 10-30 seconds depending on the document size</p>
              </div>
            </div>
            <div class="bg-muted h-2 overflow-hidden rounded-full">
              <div class="bg-primary h-full animate-pulse rounded-full" style="width: 60%" />
            </div>
          </div>
        </div>

        <div v-else-if="!isEstimating && selectedFile">
          <Button @click="estimateCost">
            <CalculatorIcon class="mr-2 size-4" />
            Analyze File
          </Button>
        </div>
      </div>

      <!-- Step 3: Extraction Results -->
      <div v-if="extractionResult" class="bg-card rounded-lg border p-6">
        <h2 class="mb-4 text-lg font-semibold">3. Extracted Transactions</h2>

        <div v-if="extractionResult.metadata.bankName" class="bg-muted mb-4 rounded-lg p-3">
          <p class="text-sm">
            <span class="text-muted-foreground">Bank:</span>
            {{ extractionResult.metadata.bankName }}
            <span v-if="extractionResult.metadata.accountNumberLast4" class="ml-2">
              <span class="text-muted-foreground">Account:</span>
              ****{{ extractionResult.metadata.accountNumberLast4 }}
            </span>
            <span v-if="extractionResult.metadata.currencyCode" class="ml-2">
              <span class="text-muted-foreground">Currency:</span>
              {{ extractionResult.metadata.currencyCode }}
            </span>
          </p>
        </div>

        <div class="mb-4 flex items-center justify-between">
          <p class="text-muted-foreground text-sm">Found {{ extractionResult.transactions.length }} transactions</p>
          <p class="text-muted-foreground text-sm">
            Tokens used: {{ extractionResult.tokenCount.input }} in / {{ extractionResult.tokenCount.output }} out
          </p>
        </div>

        <div class="max-h-96 overflow-auto rounded-lg border">
          <table class="w-full text-sm">
            <thead class="bg-muted sticky top-0">
              <tr>
                <th class="p-2 text-left">Date</th>
                <th class="p-2 text-left">Description</th>
                <th class="p-2 text-right">Amount</th>
                <th class="p-2 text-center">Type</th>
                <th class="p-2 text-center">Confidence</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(tx, index) in extractionResult.transactions"
                :key="index"
                class="border-t"
                :class="{ 'bg-yellow-500/10': tx.confidence < 0.8 }"
              >
                <td class="p-2">{{ tx.date }}</td>
                <td class="max-w-xs truncate p-2">{{ tx.description }}</td>
                <td class="p-2 text-right font-mono">
                  {{ tx.amount.toFixed(2) }}
                </td>
                <td class="p-2 text-center">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="{
                      'bg-green-500/20 text-green-700': tx.type === 'income',
                      'bg-red-500/20 text-red-700': tx.type === 'expense',
                    }"
                  >
                    {{ tx.type }}
                  </span>
                </td>
                <td class="p-2 text-center">
                  <span
                    class="text-xs"
                    :class="{
                      'text-green-600': tx.confidence >= 0.9,
                      'text-yellow-600': tx.confidence >= 0.7 && tx.confidence < 0.9,
                      'text-red-600': tx.confidence < 0.7,
                    }"
                  >
                    {{ (tx.confidence * 100).toFixed(0) }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="text-muted-foreground mt-4 text-sm">
          Note: Review and import functionality coming soon. For now, this shows the AI extraction results.
        </p>
      </div>

      <!-- Extraction Error -->
      <div v-if="extractionError" class="bg-card border-destructive rounded-lg border p-6">
        <h2 class="text-destructive mb-2 text-lg font-semibold">Extraction Failed</h2>
        <p>{{ extractionError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { estimateStatementCost, extractStatementTransactions } from '@/api/import-export';
import { Button } from '@/components/lib/ui/button';
import type { StatementCostEstimate, StatementExtractionResult, StatementFileType } from '@bt/shared/types';
import {
  CalculatorIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  XIcon,
} from 'lucide-vue-next';
import { ref } from 'vue';

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const fileError = ref<string | null>(null);
const isDragging = ref(false);
const detectedFileType = ref<StatementFileType | null>(null);

const isEstimating = ref(false);
const estimateError = ref<string | null>(null);
const costEstimate = ref<StatementCostEstimate | null>(null);

const isExtracting = ref(false);
const extractionError = ref<string | null>(null);
const extractionResult = ref<StatementExtractionResult | null>(null);
const extractionStatus = ref('Preparing extraction...');

const fileBase64 = ref<string | null>(null);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SUPPORTED_EXTENSIONS = ['.pdf', '.csv', '.txt'];
const SUPPORTED_MIME_TYPES = ['application/pdf', 'text/csv', 'text/plain'];

function getFileIcon() {
  if (!selectedFile.value) return FileIcon;
  const ext = selectedFile.value.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return FileTextIcon;
  if (ext === 'csv') return FileSpreadsheetIcon;
  return FileTextIcon;
}

function getFileTypeFromName(fileName: string): StatementFileType | null {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'csv') return 'csv';
  if (ext === 'txt') return 'txt';
  return null;
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

function validateAndSetFile(file: File) {
  fileError.value = null;
  costEstimate.value = null;
  extractionResult.value = null;
  extractionError.value = null;
  detectedFileType.value = null;

  // Check file extension
  const ext = '.' + (file.name.toLowerCase().split('.').pop() || '');
  const isValidExtension = SUPPORTED_EXTENSIONS.includes(ext);
  const isValidMimeType = SUPPORTED_MIME_TYPES.some((mime) => file.type.includes(mime.split('/')[1]!));

  if (!isValidExtension && !isValidMimeType) {
    fileError.value = 'Unsupported file type. Please upload a PDF, CSV, or TXT file.';
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    fileError.value = `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum of 10MB`;
    return;
  }

  selectedFile.value = file;
  detectedFileType.value = getFileTypeFromName(file.name);

  // Read file as base64
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    // Remove data URL prefix (data:application/pdf;base64,)
    fileBase64.value = result.split(',')[1] || result;
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  selectedFile.value = null;
  fileBase64.value = null;
  costEstimate.value = null;
  extractionResult.value = null;
  extractionError.value = null;
  fileError.value = null;
  detectedFileType.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

async function estimateCost() {
  if (!fileBase64.value) return;

  isEstimating.value = true;
  estimateError.value = null;

  try {
    const result = await estimateStatementCost({ fileBase64: fileBase64.value });

    if ('success' in result && result.success === false) {
      estimateError.value = result.error?.message || result.suggestion || 'Failed to analyze file';
    } else {
      costEstimate.value = result as StatementCostEstimate;
      detectedFileType.value = costEstimate.value.fileType;
    }
  } catch (error) {
    estimateError.value = error instanceof Error ? error.message : 'Failed to estimate cost';
  } finally {
    isEstimating.value = false;
  }
}

async function extractTransactions() {
  if (!fileBase64.value) return;

  isExtracting.value = true;
  extractionError.value = null;
  extractionStatus.value = 'Sending file to AI...';

  // Simulate progress updates
  const statusUpdates = [
    { delay: 2000, message: 'AI is reading the document...' },
    { delay: 5000, message: 'Extracting transaction data...' },
    { delay: 10000, message: 'Processing transactions...' },
    { delay: 20000, message: 'Almost done...' },
  ];

  const timeouts: ReturnType<typeof setTimeout>[] = [];
  statusUpdates.forEach(({ delay, message }) => {
    timeouts.push(
      setTimeout(() => {
        if (isExtracting.value) {
          extractionStatus.value = message;
        }
      }, delay),
    );
  });

  try {
    const result = await extractStatementTransactions({ fileBase64: fileBase64.value });
    extractionResult.value = result;
  } catch (error) {
    extractionError.value = error instanceof Error ? error.message : 'Failed to extract transactions';
  } finally {
    isExtracting.value = false;
    timeouts.forEach(clearTimeout);
  }
}
</script>
