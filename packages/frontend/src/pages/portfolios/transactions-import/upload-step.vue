<script setup lang="ts">
import { estimateInvestmentImportCost, extractInvestmentTransactions } from '@/api/investment-transactions-import';
import type { StatementCostEstimateFailure } from '@/api/import-export';
import { TextareaField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent } from '@/components/lib/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import {
  ASSET_CLASS,
  type InvestmentImportExtractionResult,
  type InvestmentImportHolding,
} from '@bt/shared/types/investments';
import type { StatementCostEstimate } from '@bt/shared/types';
import { useMutation } from '@tanstack/vue-query';
import { ClipboardIcon, FileTextIcon, FileUpIcon, Loader2Icon, SparklesIcon, XIcon } from 'lucide-vue-next';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ portfolioId: string }>();

const emit = defineEmits<{
  (e: 'extracted', payload: { holdings: InvestmentImportHolding[]; warnings: string[] }): void;
}>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

type InputMode = 'file' | 'paste';
const inputMode = ref<InputMode>('file');
const uploadedFile = ref<File | null>(null);
const pastedText = ref('');
const fileBase64 = ref<string | null>(null);
const isDragging = ref(false);

const costEstimate = ref<StatementCostEstimate | null>(null);
const estimateError = ref<string | null>(null);

async function setFile({ file }: { file: File }) {
  uploadedFile.value = file;
  pastedText.value = '';
  costEstimate.value = null;
  estimateError.value = null;
  return new Promise<void>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      fileBase64.value = result.split(',')[1] || result;
      resolve();
    };
    reader.readAsDataURL(file);
  });
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) void setFile({ file });
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  if (extract.isPending.value) return;
  const file = e.dataTransfer?.files?.[0];
  if (file) void setFile({ file });
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (extract.isPending.value) return;
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function clearFile() {
  uploadedFile.value = null;
  fileBase64.value = null;
  costEstimate.value = null;
  estimateError.value = null;
}

function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

function encodePastedText() {
  fileBase64.value = btoa(unescape(encodeURIComponent(pastedText.value)));
  uploadedFile.value = null;
}

const isReadyToExtract = computed(() => {
  if (inputMode.value === 'file') return !!uploadedFile.value && !!fileBase64.value;
  return pastedText.value.trim().length > 0;
});

const estimate = useMutation({
  mutationFn: () => {
    if (!fileBase64.value && inputMode.value === 'paste') encodePastedText();
    if (!fileBase64.value) throw new Error('No file selected');
    return estimateInvestmentImportCost({
      fileBase64: fileBase64.value,
      assetClass: ASSET_CLASS.crypto,
    });
  },
  onSuccess: (result) => {
    if ('success' in result && (result as StatementCostEstimateFailure).success === false) {
      const failure = result as StatementCostEstimateFailure;
      estimateError.value = failure.error?.message ?? failure.suggestion ?? 'Failed to analyze file';
      costEstimate.value = null;
    } else {
      costEstimate.value = result as StatementCostEstimate;
      estimateError.value = null;
    }
  },
  onError: (err: Error) => {
    estimateError.value = err.message;
    costEstimate.value = null;
  },
});

const extractAbort = ref<AbortController | null>(null);

function abortExtract() {
  extractAbort.value?.abort();
  extractAbort.value = null;
}

const extract = useMutation({
  mutationFn: () => {
    if (!fileBase64.value && inputMode.value === 'paste') encodePastedText();
    if (!fileBase64.value) throw new Error('No file selected');
    abortExtract();
    extractAbort.value = new AbortController();
    return extractInvestmentTransactions(
      {
        fileBase64: fileBase64.value,
        assetClass: ASSET_CLASS.crypto,
        defaultPortfolioId: props.portfolioId,
      },
      { signal: extractAbort.value.signal },
    );
  },
  onSuccess: (result: InvestmentImportExtractionResult) => {
    const holdings = result.holdings.map((h) => ({ ...h, transactions: h.transactions.map((tx) => ({ ...tx })) }));
    extractAbort.value = null;
    emit('extracted', { holdings, warnings: result.warnings });
  },
  onError: (err: Error) => {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    addNotification({
      text: err.message || t('investmentsImport.notifications.extractFailed'),
      type: NotificationType.error,
    });
  },
});

onBeforeUnmount(() => abortExtract());
</script>

<template>
  <Card class="overflow-hidden p-0">
    <!-- Header: compact pill tabs, left-aligned -->
    <div class="border-border/60 border-b px-5 py-4">
      <Tabs v-model="inputMode">
        <TabsList class="bg-muted/60 h-9 gap-1 rounded-full p-1">
          <TabsTrigger
            value="file"
            :disabled="extract.isPending.value"
            class="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-medium data-[state=active]:shadow-sm"
          >
            <FileTextIcon class="size-3.5" />
            {{ $t('investmentsImport.upload.fileTab') }}
          </TabsTrigger>
          <TabsTrigger
            value="paste"
            :disabled="extract.isPending.value"
            class="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-medium data-[state=active]:shadow-sm"
          >
            <ClipboardIcon class="size-3.5" />
            {{ $t('investmentsImport.upload.pasteTab') }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <!-- Body -->
    <CardContent class="space-y-4 p-5">
      <!-- File picker -->
      <div v-if="inputMode === 'file'" class="space-y-3">
        <label
          for="investmentsImport-file"
          :class="[
            'group relative flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-sm transition-all',
            extract.isPending.value ? 'border-input pointer-events-none opacity-60' : 'cursor-pointer',
            isDragging
              ? 'border-primary bg-primary/10 scale-[1.01]'
              : 'border-input hover:border-primary/60 hover:bg-primary/5',
          ]"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <div
            :class="[
              'flex size-14 items-center justify-center rounded-2xl transition-all',
              isDragging
                ? 'bg-primary/20 ring-primary/40 scale-110 ring-2'
                : 'bg-primary/10 ring-primary/10 ring-1 group-hover:scale-105',
            ]"
          >
            <FileUpIcon class="text-primary size-7" />
          </div>
          <div class="space-y-1 text-center">
            <p class="text-sm font-medium">
              {{
                isDragging ? $t('investmentsImport.upload.dropHere') : $t('investmentsImport.upload.fileHintPrimary')
              }}
            </p>
            <p class="text-muted-foreground text-xs">{{ $t('investmentsImport.upload.fileHintFormats') }}</p>
          </div>
        </label>
        <input
          id="investmentsImport-file"
          type="file"
          class="hidden"
          accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf"
          :disabled="extract.isPending.value"
          @change="onFileChange"
        />

        <!-- Selected file row -->
        <div
          v-if="uploadedFile"
          class="border-border/60 bg-muted/30 flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div class="flex min-w-0 items-center gap-3">
            <div class="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg">
              <FileTextIcon class="text-primary size-4" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ uploadedFile.name }}</p>
              <p class="text-muted-foreground text-xs">{{ formatBytes(uploadedFile.size) }}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="extract.isPending.value"
            :aria-label="$t('investmentsImport.upload.removeFile')"
            @click="clearFile"
          >
            <XIcon class="size-4" />
          </Button>
        </div>
      </div>

      <div v-else>
        <TextareaField
          v-model="pastedText"
          :placeholder="$t('investmentsImport.upload.pastePlaceholder')"
          :rows="10"
          :disabled="extract.isPending.value"
          class="font-mono text-sm"
        />
      </div>

      <!-- Cost estimate readout -->
      <div v-if="costEstimate" class="border-border/60 bg-muted/30 grid gap-2 rounded-lg border p-4 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">{{ $t('investmentsImport.upload.estimatedCost') }}</span>
          <span class="text-base font-semibold tabular-nums">${{ costEstimate.estimatedCostUsd.toFixed(4) }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">{{ $t('investmentsImport.upload.model') }}</span>
          <span class="font-mono text-xs">{{ costEstimate.modelName }}</span>
        </div>
      </div>
      <div v-if="estimateError" class="text-destructive-text text-sm">{{ estimateError }}</div>
    </CardContent>

    <!-- Footer action bar -->
    <div
      class="border-border/60 bg-muted/20 flex flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-end"
    >
      <Button
        variant="ghost"
        size="sm"
        :disabled="!isReadyToExtract || estimate.isPending.value || extract.isPending.value"
        @click="estimate.mutate()"
      >
        <Loader2Icon v-if="estimate.isPending.value" class="mr-1 size-4 animate-spin" />
        {{ $t('investmentsImport.upload.estimateButton') }}
      </Button>
      <Button :disabled="!isReadyToExtract || extract.isPending.value" @click="extract.mutate()">
        <Loader2Icon v-if="extract.isPending.value" class="mr-1 size-4 animate-spin" />
        <SparklesIcon v-else class="mr-1 size-4" />
        {{
          extract.isPending.value
            ? $t('investmentsImport.upload.extracting')
            : $t('investmentsImport.upload.extractButton')
        }}
      </Button>
    </div>
  </Card>
</template>
