<template>
  <BlockingJobOverlay
    :show-progress="showProgress"
    :is-taking-long="isTakingLong"
    :taking-long-label="$t('settings.security.backup.restore.overlay.takingLong')"
    :status-unreachable="statusUnreachable"
    :unreachable-title="$t('settings.security.backup.restore.overlay.unreachableTitle')"
    :unreachable-description="$t('settings.security.backup.restore.overlay.unreachableDescription')"
    :live-failure="overlayLiveFailure"
    :failed-title="$t('settings.security.backup.restore.overlay.failedTitle')"
    :dismiss-label="$t('settings.security.backup.restore.overlay.dismiss')"
    @dismiss="stop"
  >
    <template #progress>
      <BlockingJobProgress
        :ordered-step-keys="PHASE_ORDER"
        :step-label-keys="RESTORE_PHASE_LABEL_KEYS"
        :state="progress.kind"
        :current-step-key="progress.kind === 'running' ? progress.phase : null"
        preparing-label-key="settings.security.backup.restore.overlay.preparing"
        finishing-label-key="settings.security.backup.restore.overlay.finishing"
      >
        <template #icon>
          <DatabaseBackupIcon class="text-primary size-5" aria-hidden="true" />
        </template>
        <template #title>{{ $t('settings.security.backup.restore.overlay.title') }}</template>
        <template #description>{{ $t('settings.security.backup.restore.overlay.description') }}</template>
        <template #trailing>
          <span v-if="insertedRows != null" class="text-muted-foreground shrink-0 text-xs tabular-nums">
            {{ $t('settings.security.backup.restore.progress.inserted', { count: insertedRows }) }}
          </span>
        </template>
      </BlockingJobProgress>
    </template>
  </BlockingJobOverlay>
</template>

<script setup lang="ts">
import BlockingJobOverlay from '@/components/common/blocking-job-overlay.vue';
import BlockingJobProgress from '@/components/common/blocking-job-progress.vue';
import { RESTORE_PHASE_LABEL_KEYS } from '@/components/common/restore-phase-labels';
import { restoreDialogPresenting, useRestoreJobStatus } from '@/composable/use-restore-job-status';
import { ensureChunkLoaded } from '@/i18n';
import type { BackupRestorePhase } from '@bt/shared/types';
import { DatabaseBackupIcon } from '@lucide/vue';
import { computed, watch } from 'vue';

const { status, isBlocking, isTakingLong, liveFailure, statusUnreachable, stop } = useRestoreJobStatus();

const PHASE_ORDER = Object.keys(RESTORE_PHASE_LABEL_KEYS) as BackupRestorePhase[];

// Keep the progress card up through the brief `completed` window: the watchdog is
// wiping caches and about to reload, and dropping the overlay early would flash the
// underlying pre-restore UI. Stand down entirely while the restore dialog is the
// active presenter, so this app-root overlay never double-renders on top of it.
const showProgress = computed(
  () => !restoreDialogPresenting.value && (isBlocking.value || status.value?.state === 'completed'),
);

// Failure is likewise the dialog's to show while it presents; suppress the overlay's
// own failure panel so the two can't both render.
const overlayLiveFailure = computed(() => (restoreDialogPresenting.value ? null : liveFailure.value));

// This overlay lives at the app root and can surface on a non-settings route — e.g. a
// reload on the dashboard while a restore runs in another tab. Its strings live in the
// `settings/security` i18n chunk, which only auto-loads under /settings, so pull it in
// the moment the overlay is about to show; a no-op once the chunk is already loaded.
watch(
  () => showProgress.value || overlayLiveFailure.value != null,
  (visible) => {
    if (visible) void ensureChunkLoaded('settings/security');
  },
  { immediate: true },
);

const insertedRows = computed(() => {
  const current = status.value;
  return current?.state === 'running' ? (current.insertedRows ?? null) : null;
});

/**
 * Where the restore is now, mapped to the bar:
 *  - `running`  → 0-based index of the phase in flight
 *  - `finishing`→ the brief `completed` window before the reload (bar full)
 *  - `preparing`→ queued, or running with no phase yet (indeterminate bar)
 */
const progress = computed<
  { kind: 'running'; index: number; phase: BackupRestorePhase } | { kind: 'finishing' } | { kind: 'preparing' }
>(() => {
  const current = status.value;
  if (current?.state === 'completed') return { kind: 'finishing' };
  if (current?.state === 'running' && current.phase) {
    const index = PHASE_ORDER.indexOf(current.phase);
    if (index >= 0) return { kind: 'running', index, phase: current.phase };
  }
  return { kind: 'preparing' };
});
</script>
