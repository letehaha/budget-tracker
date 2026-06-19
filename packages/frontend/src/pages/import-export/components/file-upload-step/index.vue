<template>
  <div class="bg-card rounded-xl border">
    <!-- Body -->
    <div class="p-6">
      <div class="mb-4">
        <h2 class="text-lg font-semibold">{{ $t('pages.importExport.csvImport.fileUpload.stepTitle') }}</h2>
        <p class="text-muted-foreground text-sm">{{ $t('pages.importExport.csvImport.fileUpload.description') }}</p>
      </div>

      <FileDropzone
        v-model="selectedFile"
        accept=".csv,text/csv"
        :max-size="MAX_FILE_SIZE"
        :validator="validateFile"
        :disabled="isUploading"
        height="min-h-[200px]"
        @error="(msg) => (error = msg)"
      >
        <template #hint>{{ $t('pages.importExport.csvImport.fileUpload.maxSize') }}</template>
      </FileDropzone>

      <Callout v-if="error" variant="destructive" class="mt-4">
        {{ error }}
      </Callout>
    </div>

    <!-- Self-contained footer — rendered only when a file is selected -->
    <div v-if="selectedFile" class="border-t px-6 py-4">
      <div class="flex justify-end">
        <UiButton :disabled="isUploading" @click="handleUpload">
          <template v-if="isUploading">
            <LoaderIcon class="mr-2 size-4 animate-spin" />
            {{ $t('pages.importExport.csvImport.fileUpload.parsing') }}
          </template>
          <template v-else>
            {{ $t('pages.importExport.csvImport.fileUpload.continueToMapping') }}
          </template>
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FileDropzone from '@/components/common/file-dropzone.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { useImportExportStore } from '@/stores/import-export';
import { LoaderIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const importStore = useImportExportStore();
const { uploadedFile } = storeToRefs(importStore);

const selectedFile = computed({
  get: () => uploadedFile.value,
  set: (value) => {
    uploadedFile.value = value;
  },
});

const error = ref('');
const isUploading = ref(false);

watch(selectedFile, (file) => {
  if (file) error.value = '';
});

function validateFile({ name }: File): string | null {
  if (!name.toLowerCase().endsWith('.csv')) {
    return t('pages.importExport.csvImport.fileUpload.errors.invalidFormat');
  }
  return null;
}

const handleUpload = async () => {
  if (!selectedFile.value) return;

  isUploading.value = true;
  error.value = '';

  try {
    // parseFile internally calls goToStep('map') + markStepCompleted('upload')
    await importStore.parseFile(selectedFile.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('pages.importExport.csvImport.fileUpload.errors.parseFailed');
  } finally {
    isUploading.value = false;
  }
};
</script>
