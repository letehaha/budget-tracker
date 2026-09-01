<script setup lang="ts">
import { FileDropzone } from '@/components/common/dropzone';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { useImportOfxStore } from '@/stores/import-ofx';
import { OFX_MAX_FILE_BYTES } from '@bt/shared/types';
import { LoaderCircleIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const store = useImportOfxStore();
const selectedFile = ref<File | null>(null);
const localError = ref('');
const bounceReason = computed(() => (store.uploadId ? null : (store.detectError ?? store.executeError)));
function validateFile({ name }: File) {
  return /\.(ofx|qfx)$/i.test(name)
    ? null
    : t('pages.importExport.ofxImport.fileUpload.errors.invalidFormatNamed', { name });
}
async function handleUpload() {
  if (!selectedFile.value) return;
  localError.value = '';
  try {
    await store.uploadFile({ file: selectedFile.value });
  } catch {}
}
</script>
<template>
  <div>
    <div class="mb-4">
      <h2 class="text-lg font-semibold">{{ $t('pages.importExport.ofxImport.fileUpload.stepTitle') }}</h2>
      <p class="text-muted-foreground text-sm">{{ $t('pages.importExport.ofxImport.fileUpload.description') }}</p>
    </div>
    <Callout v-if="bounceReason" variant="warning" class="mb-4" role="alert">{{ bounceReason }}</Callout>
    <FileDropzone
      v-model="selectedFile"
      accept=".ofx,.qfx,application/x-ofx,application/vnd.intu.qfx,application/octet-stream"
      :max-size="OFX_MAX_FILE_BYTES"
      :validator="validateFile"
      :disabled="store.isUploading"
      height="min-h-[200px]"
      @error="(message) => (localError = message)"
      ><template #hint>{{ $t('pages.importExport.ofxImport.fileUpload.maxSize') }}</template></FileDropzone
    >
    <Callout v-if="localError" variant="destructive" class="mt-4" role="alert">{{ localError }}</Callout>
    <Callout v-else-if="store.uploadError" variant="destructive" class="mt-4" role="alert">{{
      store.uploadError
    }}</Callout>
    <div v-if="selectedFile" class="mt-6 flex justify-end">
      <UiButton :disabled="store.isUploading" @click="handleUpload"
        ><LoaderCircleIcon v-if="store.isUploading" class="size-4 animate-spin" />{{
          $t(
            store.isUploading
              ? 'pages.importExport.ofxImport.fileUpload.parsing'
              : 'pages.importExport.ofxImport.fileUpload.continue',
          )
        }}</UiButton
      >
    </div>
  </div>
</template>
