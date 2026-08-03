<script setup lang="ts">
/**
 * Microsoft Money upload step. The `.mny` file is sent to the server as a raw
 * binary body and parsed there; the wizard only ever keeps the returned upload
 * id and parse result.
 *
 * Every Money file is encrypted, but most have no user password. The password
 * input is therefore optional and any failure from the server is shown on the
 * field itself, since a wrong password and an unreadable file are both fixed
 * from right here.
 */
import { FileDropzone } from '@/components/common/dropzone';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { useImportMsMoneyStore } from '@/stores/import-ms-money';
import { MS_MONEY_MAX_FILE_BYTES } from '@bt/shared/types';
import { LoaderCircleIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const store = useImportMsMoneyStore();

const selectedFile = ref<File | null>(null);
const password = ref('');
/** Client-side rejection (wrong extension, oversized, unusable password). */
const localError = ref('');

/**
 * A password travels in a request header, and header values are Latin-1 only —
 * anything outside that range makes fetch throw before the request is sent.
 */
function isHeaderSafePassword({ value }: { value: string }): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code > 0xff) return false;
  }
  return true;
}

function validateFile({ name }: File): string | null {
  if (!name.toLowerCase().endsWith('.mny')) {
    return t('pages.importExport.msMoneyImport.fileUpload.errors.invalidFormatNamed', { name });
  }
  return null;
}

/** Server-side failure (bad file, wrong password), shown on the password field. */
const uploadErrorMessage = computed(() => store.uploadError ?? undefined);

/**
 * Why a later step sent the user back here. `detectDuplicates` and `execute`
 * bounce to this step when the cached parse result is gone, which without a
 * message looks like the wizard silently restarted itself.
 */
const bounceReason = computed(() => (store.uploadId ? null : (store.detectError ?? store.executeError)));

async function handleUpload() {
  const file = selectedFile.value;
  if (!file) return;

  localError.value = '';

  const trimmedPassword = password.value.trim();
  if (trimmedPassword && !isHeaderSafePassword({ value: trimmedPassword })) {
    localError.value = t('pages.importExport.msMoneyImport.fileUpload.errors.passwordUnsupportedChars');
    return;
  }

  try {
    await store.uploadFile({ file, password: trimmedPassword || undefined });
  } catch {
    // The store keeps the server's message in `uploadError`; it renders on the
    // password field and in the callout below.
  }
}
</script>

<template>
  <div>
    <div class="mb-4">
      <h2 class="text-lg font-semibold">
        {{ $t('pages.importExport.msMoneyImport.fileUpload.stepTitle') }}
      </h2>
      <p class="text-muted-foreground text-sm">
        {{ $t('pages.importExport.msMoneyImport.fileUpload.description') }}
      </p>
    </div>

    <Callout v-if="bounceReason" variant="warning" class="mb-4" role="alert">
      {{ bounceReason }}
    </Callout>

    <FileDropzone
      v-model="selectedFile"
      accept=".mny,application/octet-stream"
      :max-size="MS_MONEY_MAX_FILE_BYTES"
      :validator="validateFile"
      :disabled="store.isUploading"
      height="min-h-[200px]"
      @error="(message) => (localError = message)"
    >
      <template #hint>{{ $t('pages.importExport.msMoneyImport.fileUpload.maxSize') }}</template>
    </FileDropzone>

    <!-- Optional password. Kept visible from the start so a protected file
         doesn't have to fail once before the field appears. -->
    <div class="mt-6 max-w-md">
      <InputField
        v-model="password"
        type="password"
        :label="$t('pages.importExport.msMoneyImport.fileUpload.passwordLabel')"
        :placeholder="$t('pages.importExport.msMoneyImport.fileUpload.passwordPlaceholder')"
        :disabled="store.isUploading"
        :error-message="uploadErrorMessage"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        {{ $t('pages.importExport.msMoneyImport.fileUpload.passwordHint') }}
      </p>
    </div>

    <Callout v-if="localError" variant="destructive" class="mt-4" role="alert">
      {{ localError }}
    </Callout>
    <Callout v-else-if="store.uploadError" variant="destructive" class="mt-4" role="alert">
      {{ store.uploadError }}
    </Callout>

    <!-- Footer — rendered only once a file is selected. Uploading is an explicit
         action (no auto-start on drop) so the user can set the password first. -->
    <div v-if="selectedFile" class="mt-6 flex justify-end">
      <UiButton :disabled="store.isUploading" @click="handleUpload">
        <template v-if="store.isUploading">
          <LoaderCircleIcon class="size-4 animate-spin" />
          {{ $t('pages.importExport.msMoneyImport.fileUpload.parsing') }}
        </template>
        <template v-else>
          {{ $t('pages.importExport.msMoneyImport.fileUpload.continue') }}
        </template>
      </UiButton>
    </div>
  </div>
</template>
