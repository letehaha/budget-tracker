<template>
  <div class="flex max-w-2xl flex-col gap-4">
    <div class="divide-border divide-y overflow-hidden rounded-lg border">
      <!-- Download backup -->
      <div class="flex items-center gap-4 px-4 py-3.5">
        <div class="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
          <DownloadIcon class="size-5" aria-hidden="true" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-medium">{{ $t('settings.security.backup.download.title') }}</span>
            <Popover>
              <PopoverTrigger as-child>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-warning-text hover:text-warning-text h-auto gap-1 px-1.5 py-0.5 text-xs font-medium"
                >
                  <AlertTriangleIcon class="size-3.5" aria-hidden="true" />
                  {{ $t('settings.security.backup.download.limitations.trigger') }}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)]">
                <p class="text-sm font-medium">{{ $t('settings.security.backup.download.limitations.title') }}</p>
                <p class="text-muted-foreground mt-1 text-xs">
                  {{ $t('settings.security.backup.download.limitations.intro') }}
                </p>
                <ul class="mt-3 flex flex-col gap-2.5">
                  <li class="flex gap-2.5">
                    <LandmarkIcon class="text-warning-text mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <i18n-t
                      keypath="settings.security.backup.download.limitations.items.bankConnections"
                      tag="span"
                      class="text-muted-foreground text-xs"
                    >
                      <template #term>
                        <span class="text-foreground font-medium">{{
                          $t('settings.security.backup.download.limitations.items.bankConnectionsTerm')
                        }}</span>
                      </template>
                    </i18n-t>
                  </li>
                  <li class="flex gap-2.5">
                    <KeyRoundIcon class="text-warning-text mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <i18n-t
                      keypath="settings.security.backup.download.limitations.items.aiKeys"
                      tag="span"
                      class="text-muted-foreground text-xs"
                    >
                      <template #term>
                        <span class="text-foreground font-medium">{{
                          $t('settings.security.backup.download.limitations.items.aiKeysTerm')
                        }}</span>
                      </template>
                    </i18n-t>
                  </li>
                </ul>
                <p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
                  {{ $t('settings.security.backup.download.limitations.included') }}
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <span class="text-muted-foreground mt-0.5 text-sm">
            {{ $t('settings.security.backup.download.description') }}
          </span>
        </div>
        <Button class="shrink-0" :disabled="isDownloading" @click="handleDownload">
          <LoaderCircleIcon v-if="isDownloading" class="size-4 animate-spin" />
          {{
            isDownloading
              ? $t('settings.security.backup.download.loading')
              : $t('settings.security.backup.download.button')
          }}
        </Button>
      </div>

      <!-- Restore from backup -->
      <div class="flex items-center gap-4 px-4 py-3.5">
        <div class="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
          <UploadIcon class="size-5" aria-hidden="true" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="font-medium">{{ $t('settings.security.backup.restore.title') }}</span>
          <span class="text-muted-foreground mt-0.5 text-sm">
            {{ $t('settings.security.backup.restore.description') }}
          </span>
        </div>
        <Button variant="outline" class="shrink-0" :disabled="isReading" @click="openFilePicker">
          <LoaderCircleIcon v-if="isReading" class="size-4 animate-spin" />
          {{
            isReading ? $t('settings.security.backup.restore.reading') : $t('settings.security.backup.restore.button')
          }}
        </Button>
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".zip,application/zip" class="hidden" @change="handleFileSelected" />

    <RestoreBackupDialog
      v-model:open="isRestoreOpen"
      :file-name="selectedFileName"
      :file-content="selectedFileContent"
    />
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { useNotificationCenter } from '@/components/notification-center';
import { fileToBase64 } from '@/common/utils/file-to-base64';
import { BackupDownloadFailedError, useBackupDownload } from '@/composable/data-queries/backup';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { AlertTriangleIcon, DownloadIcon, KeyRoundIcon, LandmarkIcon, LoaderCircleIcon, UploadIcon } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import RestoreBackupDialog from '../components/restore-backup-dialog.vue';

defineOptions({
  name: 'settings-security-backup',
});

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

// A ~40MB zip base64-encodes to ~53MB, which still fits the backend's 64MB JSON body.
const MAX_BACKUP_FILE_MB = 40;
const MAX_BACKUP_FILE_BYTES = MAX_BACKUP_FILE_MB * 1024 * 1024;

const fileInput = ref<HTMLInputElement | null>(null);
const isReading = ref(false);
const isRestoreOpen = ref(false);
const selectedFileName = ref('');
const selectedFileContent = ref('');

const { mutate: download, isPending: isDownloading } = useBackupDownload();

const resolveDownloadError = (e: unknown): string => {
  if (e instanceof BackupDownloadFailedError) {
    return t('settings.security.backup.download.downloadBlocked');
  }
  if (e instanceof ApiErrorResponseError && e.data?.message) {
    return e.data.message;
  }
  return t('settings.security.backup.download.failed');
};

const handleDownload = () => {
  if (isDownloading.value) return;
  download(undefined, {
    onSuccess: () => {
      addSuccessNotification(t('settings.security.backup.download.success'));
    },
    onError: (e) => {
      addErrorNotification(resolveDownloadError(e));
      const isExpected = e instanceof BackupDownloadFailedError;
      if (!isExpected) {
        captureException({ error: e, context: { feature: 'data-backup-download' } });
      }
    },
  });
};

const openFilePicker = () => {
  fileInput.value?.click();
};

const handleFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Clear so re-selecting the same file re-fires `change`.
  input.value = '';
  if (!file) return;

  const isZip = file.name.toLowerCase().endsWith('.zip');
  if (!isZip) {
    addErrorNotification(t('settings.security.backup.restore.invalidFileType'));
    return;
  }

  if (file.size > MAX_BACKUP_FILE_BYTES) {
    addErrorNotification(t('settings.security.backup.restore.fileTooLarge', { max: `${MAX_BACKUP_FILE_MB} MB` }));
    return;
  }

  isReading.value = true;
  try {
    selectedFileContent.value = await fileToBase64({ file });
    selectedFileName.value = file.name;
    isRestoreOpen.value = true;
  } catch (e) {
    addErrorNotification(t('settings.security.backup.restore.readFailed'));
    captureException({
      error: e instanceof Error ? e : new Error(String(e)),
      context: { feature: 'data-backup-restore', stage: 'file-read' },
    });
  } finally {
    isReading.value = false;
  }
};
</script>
