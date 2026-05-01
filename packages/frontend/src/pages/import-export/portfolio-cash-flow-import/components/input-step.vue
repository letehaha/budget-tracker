<script setup lang="ts">
import TextareaField from '@/components/fields/textarea-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/lib/ui/tabs';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useDetectCashFlowDuplicates, useExtractCashFlows } from '@/composable/data-queries/portfolio-cash-flow-import';
import { validateStatementFile } from '@/pages/import-export/statement-parser/utils/file-validation';
import type { CashFlowDuplicateMatch, ExtractedCashFlowRow } from '@bt/shared/types';
import { FileSpreadsheetIcon, FileTextIcon, Loader2Icon, SparklesIcon, UploadCloudIcon, XIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  portfolioId: number;
}>();

const emit = defineEmits<{
  (
    e: 'parsed',
    payload: {
      rows: ExtractedCashFlowRow[];
      duplicates: CashFlowDuplicateMatch[];
      modelName: string;
    },
  ): void;
}>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();

type InputMode = 'text' | 'file';
const mode = ref<InputMode>('text');

const text = ref('');
const userHint = ref('');

const uploadedFile = ref<File | null>(null);
const fileError = ref<string | null>(null);
const isDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const extractMutation = useExtractCashFlows();
const detectMutation = useDetectCashFlowDuplicates();

const isBusy = computed(() => extractMutation.isPending.value || detectMutation.isPending.value);

const trimmedText = computed(() => text.value.trim());
const charCount = computed(() => trimmedText.value.length);
const MAX_CHARS = 50_000;
const isOverLimit = computed(() => charCount.value > MAX_CHARS);

const canSubmit = computed(() => {
  if (isBusy.value) return false;
  if (mode.value === 'text') return !!trimmedText.value && !isOverLimit.value;
  return !!uploadedFile.value && !fileError.value;
});

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) {
    void validateAndSetFile(input.files[0]);
  }
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) {
    void validateAndSetFile(file);
  }
}

async function validateAndSetFile(file: File) {
  fileError.value = null;
  const validation = await validateStatementFile({ file });
  if (!validation.valid) {
    fileError.value = validation.error ?? t('portfolioCashFlowImport.input.fileGenericError');
    uploadedFile.value = null;
    return;
  }
  uploadedFile.value = file;
}

function clearFile() {
  uploadedFile.value = null;
  fileError.value = null;
  if (fileInput.value) fileInput.value.value = '';
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix (e.g. "data:application/pdf;base64,")
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function fileIcon(file: File) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv') return FileSpreadsheetIcon;
  return FileTextIcon;
}

const handleParse = async () => {
  try {
    const hint = userHint.value.trim() || undefined;

    const extraction =
      mode.value === 'file' && uploadedFile.value
        ? await extractMutation.mutateAsync({
            portfolioId: props.portfolioId,
            fileBase64: await readFileAsBase64(uploadedFile.value),
            fileName: uploadedFile.value.name,
            userHint: hint,
          })
        : await extractMutation.mutateAsync({
            portfolioId: props.portfolioId,
            text: trimmedText.value,
            userHint: hint,
          });

    if (extraction.rows.length === 0) {
      addNotification({
        text: t('portfolioCashFlowImport.notifications.noRowsFound'),
        type: NotificationType.warning,
      });
      return;
    }

    const dupResponse = await detectMutation.mutateAsync({
      portfolioId: props.portfolioId,
      rows: extraction.rows,
    });

    emit('parsed', {
      rows: extraction.rows,
      duplicates: dupResponse.duplicates,
      modelName: extraction.modelName,
    });
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : t('portfolioCashFlowImport.notifications.parseError'),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <div class="grid gap-6">
    <div>
      <p class="text-muted-foreground text-sm">
        {{ $t('portfolioCashFlowImport.input.intro') }}
      </p>
    </div>

    <Tabs v-model="mode" class="w-full">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="text">{{ $t('portfolioCashFlowImport.input.tabs.text') }}</TabsTrigger>
        <TabsTrigger value="file">{{ $t('portfolioCashFlowImport.input.tabs.file') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="text" class="mt-4 grid gap-2">
        <TextareaField
          v-model="text"
          :label="$t('portfolioCashFlowImport.input.textLabel')"
          :placeholder="$t('portfolioCashFlowImport.input.textPlaceholder')"
          :disabled="isBusy"
          class="min-h-60"
          rows="12"
        />
        <div class="text-muted-foreground flex items-center justify-between text-xs">
          <span :class="{ 'text-app-expense-color': isOverLimit }">
            {{ charCount.toLocaleString() }} / {{ MAX_CHARS.toLocaleString() }}
          </span>
          <span v-if="isOverLimit" class="text-app-expense-color">
            {{ $t('portfolioCashFlowImport.input.overLimit') }}
          </span>
        </div>
      </TabsContent>

      <TabsContent value="file" class="mt-4 grid gap-3">
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

          <div v-if="!uploadedFile" class="space-y-3">
            <UploadCloudIcon class="text-muted-foreground mx-auto size-10" />
            <p class="text-muted-foreground text-sm">
              {{ $t('portfolioCashFlowImport.input.file.dragDrop') }}
            </p>
            <UiButton type="button" variant="outline" :disabled="isBusy" @click="fileInput?.click()">
              {{ $t('portfolioCashFlowImport.input.file.browseButton') }}
            </UiButton>
            <p class="text-muted-foreground text-xs">
              {{ $t('portfolioCashFlowImport.input.file.supportedFormats') }}
            </p>
          </div>

          <div v-else class="space-y-2">
            <component :is="fileIcon(uploadedFile)" class="text-primary mx-auto size-10" />
            <p class="font-medium">{{ uploadedFile.name }}</p>
            <p class="text-muted-foreground text-sm">
              {{
                t('portfolioCashFlowImport.input.file.fileSize', {
                  size: (uploadedFile.size / 1024).toFixed(1),
                })
              }}
            </p>
            <UiButton type="button" variant="ghost-destructive" size="sm" :disabled="isBusy" @click="clearFile">
              <XIcon class="mr-1 size-4" />
              {{ $t('portfolioCashFlowImport.input.file.removeButton') }}
            </UiButton>
          </div>
        </div>

        <div v-if="fileError" class="bg-destructive/10 text-destructive-text rounded-md p-3 text-sm">
          {{ fileError }}
        </div>
      </TabsContent>
    </Tabs>

    <TextareaField
      v-model="userHint"
      :label="$t('portfolioCashFlowImport.input.hintLabel')"
      :placeholder="$t('portfolioCashFlowImport.input.hintPlaceholder')"
      :disabled="isBusy"
      rows="3"
    />

    <div class="flex flex-col items-end gap-2">
      <p class="text-muted-foreground max-w-md text-right text-xs">
        {{ $t('portfolioCashFlowImport.input.timingNote') }}
      </p>
      <UiButton type="button" :disabled="!canSubmit" @click="handleParse">
        <Loader2Icon v-if="isBusy" class="mr-2 size-4 animate-spin" />
        <SparklesIcon v-else class="mr-2 size-4" />
        {{ isBusy ? $t('portfolioCashFlowImport.input.parsing') : $t('portfolioCashFlowImport.input.parseButton') }}
      </UiButton>
    </div>
  </div>
</template>
