<template>
  <BlockingJobOverlay
    :show-progress="showProgress"
    :is-taking-long="isTakingLong"
    :taking-long-label="$t('settings.security.backup.restore.overlay.takingLong')"
    :status-unreachable="statusUnreachable"
    :unreachable-title="$t('settings.security.backup.restore.overlay.unreachableTitle')"
    :unreachable-description="$t('settings.security.backup.restore.overlay.unreachableDescription')"
    :live-failure="liveFailure"
    :failed-title="$t('settings.security.backup.restore.overlay.failedTitle')"
    :dismiss-label="$t('settings.security.backup.restore.overlay.dismiss')"
    @dismiss="stop"
  >
    <template #progress>
      <!-- Hero: a spinning ring around a restore badge signals the wipe-and-replace is live. -->
      <div class="relative mx-auto flex size-16 items-center justify-center">
        <Loader2Icon
          class="text-primary/30 animation-duration-[2.5s] absolute size-16 animate-spin motion-reduce:hidden"
          aria-hidden="true"
        />
        <div class="bg-primary/10 ring-primary/15 flex size-11 items-center justify-center rounded-full ring-1">
          <DatabaseBackupIcon class="text-primary size-5" aria-hidden="true" />
        </div>
      </div>

      <h2 id="blocking-job-overlay-title" class="mt-5 text-lg font-semibold">
        {{ $t('settings.security.backup.restore.overlay.title') }}
      </h2>

      <p id="blocking-job-overlay-description" class="text-muted-foreground mt-2 text-sm">
        {{ $t('settings.security.backup.restore.overlay.description') }}
      </p>

      <div class="mt-6">
        <div
          class="bg-primary/25 relative h-2 w-full overflow-hidden rounded-full"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="totalPhases"
          :aria-valuenow="currentPhaseNumber ?? undefined"
        >
          <div
            class="bg-primary absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
            :style="{ width: `${donePercent}%` }"
          />
          <div v-if="showSweep" class="bjo-sweep pointer-events-none absolute inset-0" aria-hidden="true" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 text-sm">
          <span class="text-foreground flex min-w-0 items-center gap-2 font-medium">
            <CircleCheckIcon v-if="isFinishing" class="text-success-text size-4 shrink-0" aria-hidden="true" />
            <span v-else class="bg-primary size-1.5 shrink-0 animate-pulse rounded-full" aria-hidden="true" />
            <span class="truncate">{{ $t(currentLabelKey) }}</span>
          </span>

          <span v-if="insertedRows != null" class="text-muted-foreground shrink-0 text-xs tabular-nums">
            {{ $t('settings.security.backup.restore.progress.inserted', { count: insertedRows }) }}
          </span>
        </div>
      </div>
    </template>
  </BlockingJobOverlay>
</template>

<script setup lang="ts">
import BlockingJobOverlay from '@/components/common/blocking-job-overlay.vue';
import { useRestoreJobStatus } from '@/composable/use-restore-job-status';
import { ensureChunkLoaded } from '@/i18n';
import type { BackupRestorePhase } from '@bt/shared/types';
import { CircleCheckIcon, DatabaseBackupIcon, Loader2Icon } from '@lucide/vue';
import { computed, watch } from 'vue';

const { status, isBlocking, isTakingLong, liveFailure, statusUnreachable, stop } = useRestoreJobStatus();

// Declared in the backend's restore order (see BackupRestorePhase) so the key order
// is the source for phase numbering, and `satisfies` breaks the build if a backend
// phase is added or renamed instead of silently rendering a raw i18n key.
const PHASE_LABEL_KEYS = {
  validating: 'settings.security.backup.restore.progress.phases.validating',
  'preparing-securities': 'settings.security.backup.restore.progress.phases.preparingSecurities',
  wiping: 'settings.security.backup.restore.progress.phases.wiping',
  restoring: 'settings.security.backup.restore.progress.phases.restoring',
  finalizing: 'settings.security.backup.restore.progress.phases.finalizing',
} satisfies Record<BackupRestorePhase, string>;

const PHASE_ORDER = Object.keys(PHASE_LABEL_KEYS) as BackupRestorePhase[];
const totalPhases = PHASE_ORDER.length;

// Keep the progress card up through the brief `completed` window: the watchdog is
// wiping caches and about to reload, and dropping the overlay early would flash the
// underlying pre-restore UI.
const showProgress = computed(() => isBlocking.value || status.value?.state === 'completed');

// This overlay lives at the app root and can surface on a non-settings route — e.g. a
// reload on the dashboard while a restore runs in another tab. Its strings live in the
// `settings/security` i18n chunk, which only auto-loads under /settings, so pull it in
// the moment the overlay is about to show; a no-op once the chunk is already loaded.
watch(
  () => showProgress.value || liveFailure.value != null,
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

const isFinishing = computed(() => progress.value.kind === 'finishing');
const showSweep = computed(() => progress.value.kind !== 'finishing');

const donePercent = computed(() => {
  const p = progress.value;
  if (p.kind === 'finishing') return 100;
  if (p.kind === 'running') return (p.index / totalPhases) * 100;
  return 0;
});

const currentPhaseNumber = computed(() => (progress.value.kind === 'running' ? progress.value.index + 1 : null));

const currentLabelKey = computed(() => {
  const p = progress.value;
  if (p.kind === 'running') return PHASE_LABEL_KEYS[p.phase];
  if (p.kind === 'finishing') return 'settings.security.backup.restore.overlay.finishing';
  return 'settings.security.backup.restore.overlay.preparing';
});
</script>

<style scoped>
/* A soft white highlight travelling left→right across the bar — signals the restore
   is actively progressing, on top of the determinate done/remaining fill. */
.bjo-sweep {
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-primary-foreground) 24%, transparent),
    transparent
  );
  transform: translateX(-100%);
  animation: bjo-sweep 1.4s linear infinite;
}

@keyframes bjo-sweep {
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bjo-sweep {
    animation: none;
  }
}
</style>
