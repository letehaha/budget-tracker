<script setup lang="ts">
import { estimateInvestmentImportCost, extractInvestmentTransactions } from '@/api/investment-transactions-import';
import type { StatementCostEstimateFailure } from '@/api/import-export';
import FileDropzone from '@/components/common/file-dropzone.vue';
import { TextareaField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent } from '@/components/lib/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { getApiErrorMessage } from '@/js/errors';
import type { InvestmentImportExtractionResult, InvestmentImportHolding } from '@bt/shared/types/investments';
import type { StatementCostEstimate } from '@bt/shared/types';
import { useMutation } from '@tanstack/vue-query';
import { ClipboardIcon, FileTextIcon, Loader2Icon, SparklesIcon } from 'lucide-vue-next';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ portfolioId: string }>();

const emit = defineEmits<{
  (e: 'extracted', payload: { holdings: InvestmentImportHolding[]; warnings: string[] }): void;
}>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();

type InputMode = 'file' | 'paste';
const inputMode = ref<InputMode>('file');
const uploadedFile = ref<File | null>(null);
const pastedText = ref('');
const fileBase64 = ref<string | null>(null);

const costEstimate = ref<StatementCostEstimate | null>(null);
const estimateError = ref<string | null>(null);

watch(uploadedFile, (file) => {
  pastedText.value = '';
  costEstimate.value = null;
  estimateError.value = null;
  if (!file) {
    fileBase64.value = null;
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    fileBase64.value = result.split(',')[1] || result;
  };
  reader.readAsDataURL(file);
});

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
    estimateError.value = getApiErrorMessage({
      e: err,
      t,
      conflictKey: 'investmentsImport.notifications.estimateFailed',
      fallbackKey: 'investmentsImport.notifications.estimateFailed',
    });
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
      text: getApiErrorMessage({
        e: err,
        t,
        conflictKey: 'investmentsImport.notifications.extractFailed',
        fallbackKey: 'investmentsImport.notifications.extractFailed',
      }),
      type: NotificationType.error,
    });
  },
});

function onDropzoneError(message: string) {
  addNotification({ text: message, type: NotificationType.error });
}

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
      <FileDropzone
        v-if="inputMode === 'file'"
        v-model="uploadedFile"
        accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf"
        :disabled="extract.isPending.value"
        @error="onDropzoneError"
      >
        <template #hint>{{ $t('investmentsImport.upload.fileHintFormats') }}</template>
      </FileDropzone>

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
