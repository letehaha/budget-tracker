<template>
  <div class="bg-card rounded-lg border p-6">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">Step 1: Upload CSV File</h2>
      <p class="text-muted-foreground text-sm">Select a CSV file from your computer (max 50MB)</p>
    </div>

    <div
      class="border-muted-foreground/25 hover:border-primary flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors"
      :class="{ 'border-primary bg-primary/5': isDragging }"
      @click="handleClick"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <template v-if="!selectedFile">
        <UploadIcon class="text-muted-foreground mb-4 size-12" />

        <p class="text-foreground mb-2 font-medium">Drag and drop your CSV file here</p>
        <p class="text-muted-foreground text-sm">or click to browse</p>
        <p class="text-muted-foreground mt-4 text-xs">Maximum file size: 50MB</p>
      </template>

      <template v-else>
        <div class="text-center">
          <FileIcon class="text-primary mb-2 inline-block size-8" />
          <p class="text-foreground font-medium">{{ selectedFile.name }}</p>
          <p class="text-muted-foreground text-sm">
            {{ formatFileSize(selectedFile.size) }}
          </p>
          <UiButton variant="outline" size="sm" class="mt-4" @click.stop="clearFile"> Remove file </UiButton>
        </div>
      </template>

      <input ref="fileInputRef" type="file" accept=".csv,text/csv" class="hidden" @change="handleFileSelect" />
    </div>

    <div v-if="error" class="bg-destructive/10 text-destructive mt-4 rounded-lg p-3 text-sm">
      {{ error }}
    </div>

    <div v-if="selectedFile" class="mt-6 flex justify-end">
      <UiButton @click="handleUpload" :disabled="isUploading">
        <template v-if="isUploading">
          <LoaderIcon class="mr-2 size-4 animate-spin" />
          Parsing...
        </template>
        <template v-else> Continue to Column Mapping </template>
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useImportExportStore } from '@/stores/import-export';
import { FileIcon, LoaderIcon, UploadIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const importStore = useImportExportStore();
const { uploadedFile } = storeToRefs(importStore);

const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFile = computed({
  get: () => uploadedFile.value,
  set: (value) => {
    uploadedFile.value = value;
  },
});
const isDragging = ref(false);
const error = ref('');
const isUploading = ref(false);

const handleClick = () => {
  fileInputRef.value?.click();
};

const validateFile = (file: File): string | null => {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'Please select a CSV file';
  }

  if (file.size > MAX_FILE_SIZE) {
    return `File size exceeds 50MB (${formatFileSize(file.size)})`;
  }

  return null;
};

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    const validationError = validateFile(file);
    if (validationError) {
      error.value = validationError;
      selectedFile.value = null;
      return;
    }

    error.value = '';
    selectedFile.value = file;
  }
};

const handleDrop = (event: DragEvent) => {
  isDragging.value = false;

  const file = event.dataTransfer?.files[0];
  if (file) {
    const validationError = validateFile(file);
    if (validationError) {
      error.value = validationError;
      selectedFile.value = null;
      return;
    }

    error.value = '';
    selectedFile.value = file;
  }
};

const clearFile = () => {
  selectedFile.value = null;
  error.value = '';
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const handleUpload = async () => {
  if (!selectedFile.value) return;

  isUploading.value = true;
  error.value = '';

  try {
    await importStore.parseFile(selectedFile.value);
    // Store will update currentStep to 2 after successful parse
    // TODO: Show step 2 (column mapping) when ready
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to parse CSV file';
  } finally {
    isUploading.value = false;
  }
};
</script>
