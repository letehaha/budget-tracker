<template>
  <div>
    <div class="mb-4">
      <h2 class="text-lg font-semibold">{{ $t('pages.importExport.walletImport.fileUpload.stepTitle') }}</h2>
      <p class="text-muted-foreground text-sm">{{ $t('pages.importExport.walletImport.fileUpload.description') }}</p>
    </div>

    <FileDropzone
      v-model="selectedFile"
      accept=".csv,text/csv"
      :max-size="MAX_FILE_SIZE"
      :validator="validateFile"
      :disabled="store.isParsing"
      height="min-h-[200px]"
      @update:model-value="onFileSelected"
      @error="(msg) => (uploadError = msg)"
    >
      <template #hint>{{ $t('pages.importExport.walletImport.fileUpload.maxSize') }}</template>
    </FileDropzone>

    <div v-if="store.isParsing" class="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
      <LoaderIcon class="size-4 animate-spin" />
      {{ $t('pages.importExport.walletImport.fileUpload.parsing') }}
    </div>

    <Callout v-if="uploadError" variant="destructive" class="mt-4" role="alert">
      {{ uploadError }}
    </Callout>
    <Callout v-else-if="store.parseError" variant="destructive" class="mt-4" role="alert">
      {{ store.parseError }}
    </Callout>
  </div>
</template>

<script setup lang="ts">
import FileDropzone from '@/components/common/file-dropzone.vue';
import { Callout } from '@/components/lib/ui/callout';
import { useImportWalletStore } from '@/stores/import-wallet';
import { LoaderIcon } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const store = useImportWalletStore();

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Local handle for the dropzone; parsing kicks off immediately on selection. */
const selectedFile = ref<File | null>(null);
const uploadError = ref('');

function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return t('pages.importExport.walletImport.fileUpload.errors.invalidFormat');
  }
  return null;
}

/** Parse as soon as a valid file is dropped; the store advances to resolve on success. */
async function onFileSelected(file: File | null) {
  if (!file) return;
  uploadError.value = '';
  try {
    await store.parseFile({ file });
  } catch {
    // Store sets parseError; rendered via Callout.
  }
}
</script>
