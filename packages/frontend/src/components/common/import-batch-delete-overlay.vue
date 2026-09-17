<template>
  <BlockingJobOverlay
    :show-progress="showProgress"
    :is-taking-long="isTakingLong"
    :taking-long-label="$t('common.importBatchDeleteOverlay.takingLong')"
    :status-unreachable="statusUnreachable"
    :unreachable-title="$t('common.importBatchDeleteOverlay.unreachableTitle')"
    :unreachable-description="$t('common.importBatchDeleteOverlay.unreachableDescription')"
    :live-failure="liveFailure"
    :failed-title="$t('common.importBatchDeleteOverlay.failedTitle')"
    :dismiss-label="$t('common.importBatchDeleteOverlay.dismiss')"
    @dismiss="stop"
  >
    <template #icon>
      <Trash2Icon class="text-primary-text size-5" aria-hidden="true" />
    </template>
    <template #title>{{ $t('common.importBatchDeleteOverlay.title') }}</template>
    <template #description>{{ $t('common.importBatchDeleteOverlay.description') }}</template>
    <template #progress>
      <BlockingJobProgress
        :ordered-step-keys="STEP_ORDER"
        :step-label-keys="STEP_LABEL_KEYS"
        :state="progressState"
        :current-step-key="progressState === 'running' ? 'deleting' : null"
        preparing-label-key="common.importBatchDeleteOverlay.preparing"
        finishing-label-key="common.importBatchDeleteOverlay.finishing"
      />
    </template>
  </BlockingJobOverlay>
</template>

<script setup lang="ts">
import BlockingJobOverlay from '@/components/common/blocking-job-overlay.vue';
import BlockingJobProgress from '@/components/common/blocking-job-progress.vue';
import { useImportBatchDeleteJobStatus } from '@/composable/use-import-batch-delete-job-status';
import { Trash2Icon } from '@lucide/vue';
import { computed } from 'vue';

const { status, isBlocking, isTakingLong, liveFailure, statusUnreachable, stop } = useImportBatchDeleteJobStatus();

const STEP_LABEL_KEYS = {
  deleting: 'common.importBatchDeleteOverlay.deleting',
};
const STEP_ORDER = Object.keys(STEP_LABEL_KEYS);

// Keep the card up through the brief `completed` window: the watchdog is wiping caches
// and about to reload, and dropping the overlay early would flash stale balances.
const showProgress = computed(() => isBlocking.value || status.value?.state === 'completed');

const progressState = computed<'preparing' | 'running' | 'finishing'>(() => {
  if (status.value?.state === 'completed') return 'finishing';
  if (status.value?.state === 'running') return 'running';
  return 'preparing';
});
</script>
