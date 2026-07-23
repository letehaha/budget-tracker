<script setup lang="ts">
import type { WipeDataSharedResources } from '@/api/user';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { RESTORE_PHASE_LABEL_KEYS } from '@/components/common/restore-phase-labels';
import { Button } from '@/components/lib/ui/button';
import { Callout } from '@/components/lib/ui/callout';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { useRestoreBackup, useRestoreStatus } from '@/composable/data-queries/backup';
import { useRestoreJobStatus } from '@/composable/use-restore-job-status';
import { ApiErrorResponseError } from '@/js/errors';
import { resetQueryCaches } from '@/lib/query-persister';
import { captureException } from '@/lib/sentry';
import { API_ERROR_CODES, type BackupRestorePhase } from '@bt/shared/types';
import { LoaderCircleIcon } from '@lucide/vue';
import { useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  open: boolean;
  fileName: string;
  fileContent: string;
}>();

const emit = defineEmits<{ 'update:open': [boolean] }>();

const { t } = useI18n();
const queryClient = useQueryClient();

type Step = 'confirm' | 'acknowledge' | 'progress' | 'summary' | 'failed';

const step = ref<Step>('confirm');
const jobId = ref<string | null>(null);
const sharedResources = ref<WipeDataSharedResources | null>(null);
const acknowledged = ref(false);
const failureMessage = ref('');

const { mutate: restore, isPending: isSubmitting } = useRestoreBackup();
const { data: statusData, isError: isStatusError, error: statusError } = useRestoreStatus({ jobId });

// Matches the boot watchdog's taking-long threshold: the restore holds the same
// wipe-and-replace lock, and the backend ticks progress once per table, so a single
// huge table (hundreds of thousands of rows) legitimately sits on one phase for
// minutes. After this window the dialog surfaces a "still working" note but keeps
// polling and blocking — it never calls a healthy destructive restore failed.
const RESTORE_TAKING_LONG_THRESHOLD_MS = 5 * 60 * 1000;

const isTakingLong = ref(false);
let takingLongTimer: ReturnType<typeof setTimeout> | null = null;

// Signature of the last observed progress point (phase + inserted rows). The timer
// re-arms only when this actually changes, so neither per-poll object churn nor the
// status query's structural sharing can wrongly reset the clock or leave it running.
let lastProgressSignature: string | null = null;

const clearTakingLongTimer = () => {
  if (takingLongTimer) {
    clearTimeout(takingLongTimer);
    takingLongTimer = null;
  }
};

// Bail to a safe "reload and check" message. Reserved for a poll that keeps failing
// (status genuinely unverifiable), not for a slow-but-healthy restore: the wipe is
// atomic (already committed or rolled back), so the honest move is to stop the
// spinner and let the user verify, rather than pretend we know the outcome.
const failWithUnconfirmed = () => {
  clearTakingLongTimer();
  isTakingLong.value = false;
  failureMessage.value = t('settings.security.backup.restore.failed.unconfirmed');
  step.value = 'failed';
  // Stop polling — the status is untrustworthy.
  jobId.value = null;
};

// Restart the "still working" timer from the moment the restore last advanced.
const armTakingLongTimer = () => {
  clearTakingLongTimer();
  isTakingLong.value = false;
  takingLongTimer = setTimeout(() => {
    if (step.value === 'progress') isTakingLong.value = true;
  }, RESTORE_TAKING_LONG_THRESHOLD_MS);
};

const summary = computed(() => statusData.value?.summary ?? null);
const progressPhase = computed<BackupRestorePhase | null>(() => statusData.value?.progress?.phase ?? null);
const progressInserted = computed(() => statusData.value?.progress?.insertedRows ?? null);

const phaseLabel = computed(() =>
  progressPhase.value
    ? t(RESTORE_PHASE_LABEL_KEYS[progressPhase.value])
    : t('settings.security.backup.restore.progress.phases.validating'),
);

// Non-zero per-table counts, biggest first, so the meaningful tables surface.
const restoredEntries = computed(() =>
  Object.entries(summary.value?.insertedByTable ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]),
);

const warnings = computed(() => summary.value?.warnings ?? []);

const humanizeTable = (table: string) => table.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const resetState = () => {
  clearTakingLongTimer();
  isTakingLong.value = false;
  lastProgressSignature = null;
  step.value = 'confirm';
  jobId.value = null;
  sharedResources.value = null;
  acknowledged.value = false;
  failureMessage.value = '';
};

// A fresh open always starts a new restore attempt from the confirm step.
watch(
  () => props.open,
  (open) => {
    if (open) resetState();
    else clearTakingLongTimer();
  },
);

onBeforeUnmount(clearTakingLongTimer);

// Drive the step machine off the poll's terminal states.
watch(statusData, (status) => {
  if (!status) return;
  if (status.status === 'completed') {
    clearTakingLongTimer();
    isTakingLong.value = false;
    step.value = 'summary';
    // Mark this restore handled for the boot watchdog: this dialog already wipes the
    // cache and reloads on "Done", so a plain F5 from the summary must not make the
    // next boot wipe + reload a second time.
    if (jobId.value) useRestoreJobStatus().markHandled({ jobId: jobId.value });
    // Purge the persisted IndexedDB cache the moment the restore lands, not only
    // on the "Done" click — otherwise closing the tab before clicking Done leaves
    // the pre-restore data to rehydrate on the next load.
    void resetQueryCaches(queryClient).catch((error) =>
      captureException({ error, context: { feature: 'data-backup-restore' } }),
    );
  } else if (status.status === 'failed') {
    clearTakingLongTimer();
    isTakingLong.value = false;
    failureMessage.value = status.error || t('settings.security.backup.restore.failed.genericError');
    step.value = 'failed';
  } else {
    // Still working. Re-arm the "still working" timer only when the restore actually
    // advanced (new phase or more rows), so a long single-table insert can't reset
    // the clock forever and a genuinely stalled one still surfaces the note.
    const signature = `${status.progress?.phase ?? ''}:${status.progress?.insertedRows ?? ''}`;
    if (signature !== lastProgressSignature) {
      lastProgressSignature = signature;
      armTakingLongTimer();
    }
  }
});

// A persistently-failing status poll never yields a terminal payload, so watch
// the query's own error state and bail instead of spinning forever.
watch(isStatusError, (errored) => {
  if (!errored || step.value !== 'progress') return;
  if (statusError.value) {
    captureException({ error: statusError.value, context: { feature: 'data-backup-restore' } });
  }
  failWithUnconfirmed();
});

const submit = ({ acknowledgeSharing }: { acknowledgeSharing?: boolean }) => {
  restore(
    { fileContent: props.fileContent, acknowledgeSharing },
    {
      onSuccess: ({ jobId: id }) => {
        jobId.value = id;
        step.value = 'progress';
        lastProgressSignature = null;
        // Start the "still working" timer in case the first poll never arrives.
        armTakingLongTimer();
      },
      onError: (e) => {
        if (
          e instanceof ApiErrorResponseError &&
          e.data?.code === API_ERROR_CODES.wipeDataSharingAcknowledgementRequired
        ) {
          sharedResources.value =
            (e.data.details as { sharedResources?: WipeDataSharedResources } | undefined)?.sharedResources ?? null;
          acknowledged.value = false;
          step.value = 'acknowledge';
          return;
        }
        // Validation (bad zip / incompatible version / checksum) and everything else:
        // surface the server-provided reason. Only capture the truly unexpected ones.
        const isValidation = e instanceof ApiErrorResponseError && e.data?.code === API_ERROR_CODES.validationError;
        failureMessage.value =
          (e instanceof ApiErrorResponseError && e.data?.message) ||
          t('settings.security.backup.restore.failed.genericError');
        step.value = 'failed';
        if (!isValidation) {
          captureException({ error: e, context: { feature: 'data-backup-restore' } });
        }
      },
    },
  );
};

const handleConfirm = () => submit({});
const handleAcknowledge = () => {
  if (!acknowledged.value) return;
  submit({ acknowledgeSharing: true });
};

const setOpen = (open: boolean) => {
  emit('update:open', open);
};

// Restore wipes and replaces every table, so the persisted IndexedDB cache would
// rehydrate the pre-restore data on next load. Purge it (same teardown as logout /
// wipe) and hard-reload so the app reflects exactly what was restored.
const finishAndReload = async () => {
  // The reload must happen even if the purge rejects — otherwise the click looks
  // dead and stale pre-restore data can rehydrate later.
  try {
    await resetQueryCaches(queryClient);
  } finally {
    window.location.reload();
  }
};

const handleClose = () => setOpen(false);
</script>

<template>
  <ResponsiveDialog :open="open" dialog-content-class="max-w-lg" @update:open="setOpen">
    <template #title>
      <template v-if="step === 'confirm'">{{ $t('settings.security.backup.restore.confirm.title') }}</template>
      <template v-else-if="step === 'acknowledge'">{{
        $t('settings.security.backup.restore.acknowledge.title')
      }}</template>
      <template v-else-if="step === 'progress'">{{ $t('settings.security.backup.restore.progress.title') }}</template>
      <template v-else-if="step === 'summary'">{{ $t('settings.security.backup.restore.summary.title') }}</template>
      <template v-else>{{ $t('settings.security.backup.restore.failed.title') }}</template>
    </template>

    <!-- Confirm -->
    <div v-if="step === 'confirm'" class="flex flex-col gap-4 text-left">
      <Callout variant="destructive" :title="$t('settings.security.backup.restore.confirm.warning')">
        <p>{{ $t('settings.security.backup.restore.confirm.description') }}</p>
      </Callout>
      <Callout variant="warning" :title="$t('settings.security.backup.restore.confirm.reconnectTitle')">
        <ul class="mt-1 list-inside list-disc space-y-1 text-sm">
          <li>{{ $t('settings.security.backup.restore.confirm.reconnectBankConnections') }}</li>
          <li>{{ $t('settings.security.backup.restore.confirm.reconnectAiKeys') }}</li>
        </ul>
      </Callout>
      <p class="text-muted-foreground truncate text-sm">
        {{ $t('settings.security.backup.restore.confirm.selectedFile', { name: fileName }) }}
      </p>
    </div>

    <!-- Acknowledge shared resources -->
    <div v-else-if="step === 'acknowledge'" class="flex flex-col gap-4 text-left">
      <p class="text-sm">{{ $t('settings.security.backup.restore.acknowledge.description') }}</p>
      <ul v-if="sharedResources?.accounts?.length" class="list-inside list-disc text-sm">
        <li v-for="account in sharedResources.accounts" :key="account.id">{{ account.name }}</li>
      </ul>
      <p v-if="sharedResources?.households?.length" class="text-sm">
        {{
          $t('settings.security.backup.restore.acknowledge.householdsCount', {
            count: sharedResources.households.length,
          })
        }}
      </p>
      <label class="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox :model-value="acknowledged" @update:model-value="(val) => (acknowledged = !!val)" />
        <span>{{ $t('settings.security.backup.restore.acknowledge.checkbox') }}</span>
      </label>
    </div>

    <!-- Progress -->
    <div v-else-if="step === 'progress'" class="flex flex-col items-center gap-3 py-6 text-center">
      <LoaderCircleIcon class="text-primary size-8 animate-spin" />
      <p class="font-medium">{{ phaseLabel }}</p>
      <p v-if="progressInserted != null" class="text-muted-foreground text-sm">
        {{ $t('settings.security.backup.restore.progress.inserted', { count: progressInserted }) }}
      </p>
      <p class="text-muted-foreground text-xs">
        {{ $t('settings.security.backup.restore.progress.description') }}
      </p>
      <p v-if="isTakingLong" class="text-muted-foreground text-xs">
        {{ $t('settings.security.backup.restore.overlay.takingLong') }}
      </p>
    </div>

    <!-- Summary -->
    <div v-else-if="step === 'summary'" class="flex flex-col gap-4 text-left">
      <Callout variant="success">
        <p>{{ $t('settings.security.backup.restore.summary.description') }}</p>
      </Callout>

      <div>
        <p class="mb-2 text-sm font-medium">
          {{ $t('settings.security.backup.restore.summary.recordsHeading') }}
        </p>
        <p v-if="!restoredEntries.length" class="text-muted-foreground text-sm">
          {{ $t('settings.security.backup.restore.summary.noRecords') }}
        </p>
        <ul v-else class="divide-border divide-y rounded-lg border text-sm">
          <li v-for="[table, count] in restoredEntries" :key="table" class="flex justify-between px-3 py-2">
            <span>{{ humanizeTable(table) }}</span>
            <span class="text-muted-foreground tabular-nums">{{ count }}</span>
          </li>
        </ul>
      </div>

      <div v-if="warnings.length">
        <p class="mb-2 text-sm font-medium">
          {{ $t('settings.security.backup.restore.summary.warningsHeading') }}
        </p>
        <div class="flex flex-col gap-2">
          <Callout v-for="(warning, index) in warnings" :key="index" variant="warning">
            <p>{{ warning.message }}</p>
          </Callout>
        </div>
      </div>
    </div>

    <!-- Failed -->
    <div v-else class="flex flex-col gap-4 text-left">
      <Callout variant="destructive">
        <p>{{ failureMessage }}</p>
      </Callout>
    </div>

    <template #footer>
      <template v-if="step === 'confirm'">
        <Button variant="outline" @click="handleClose">{{ $t('common.actions.cancel') }}</Button>
        <Button variant="destructive" :disabled="isSubmitting" @click="handleConfirm">
          <LoaderCircleIcon v-if="isSubmitting" class="size-4 animate-spin" />
          {{ $t('settings.security.backup.restore.confirm.confirmLabel') }}
        </Button>
      </template>
      <template v-else-if="step === 'acknowledge'">
        <Button variant="outline" @click="handleClose">{{ $t('common.actions.cancel') }}</Button>
        <Button variant="destructive" :disabled="!acknowledged || isSubmitting" @click="handleAcknowledge">
          <LoaderCircleIcon v-if="isSubmitting" class="size-4 animate-spin" />
          {{ $t('settings.security.backup.restore.acknowledge.confirmLabel') }}
        </Button>
      </template>
      <template v-else-if="step === 'summary'">
        <Button @click="finishAndReload">{{ $t('settings.security.backup.restore.summary.doneButton') }}</Button>
      </template>
      <template v-else-if="step === 'failed'">
        <Button variant="outline" @click="handleClose">{{
          $t('settings.security.backup.restore.failed.closeButton')
        }}</Button>
      </template>
    </template>
  </ResponsiveDialog>
</template>
