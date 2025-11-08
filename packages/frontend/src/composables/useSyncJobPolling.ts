import { getSyncJobProgress, getActiveSyncJobs, type JobProgress } from '@/api/bank-data-providers';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useQueryClient } from '@tanstack/vue-query';
import { ref, computed } from 'vue';

interface ActiveJob {
  jobGroupId: string;
  connectionId: number;
  pollInterval: ReturnType<typeof setInterval>;
  timeoutId: ReturnType<typeof setTimeout>;
  lastNotifiedBatch: number;
}

// Global state for active polling jobs
const activeJobs = ref<Map<string, ActiveJob>>(new Map());
let jobsRestored = false;

export function useSyncJobPolling() {
  const { addNotification } = useNotificationCenter();
  const queryClient = useQueryClient();

  // Restore active jobs from backend on first use
  const restoreActiveJobs = async () => {
    if (jobsRestored) return; // Only restore once
    jobsRestored = true;

    try {
      const jobs = await getActiveSyncJobs();

      if (jobs.length > 0) {
        addNotification({
          text: `Continuing ${jobs.length} sync job(s) from previous session...`,
          type: NotificationType.info,
        });

        jobs.forEach((job) => {
          startPolling(job.jobGroupId, job.connectionId);
        });
      }
    } catch (error) {
      console.error('Failed to restore active sync jobs:', error);
    }
  };

  // Call restore on composable initialization
  restoreActiveJobs();

  const isJobActive = (jobGroupId: string) => {
    return activeJobs.value.has(jobGroupId);
  };

  const activeJobIds = computed(() => Array.from(activeJobs.value.keys()));

  const startPolling = (jobGroupId: string, connectionId: number) => {
    // Prevent duplicate polling for the same job
    if (activeJobs.value.has(jobGroupId)) {
      return;
    }

    let lastNotifiedBatch = 0;

    const pollInterval = setInterval(async () => {
      try {
        const progress: JobProgress = await getSyncJobProgress(connectionId, jobGroupId);

        if (progress.status === 'completed') {
          stopPolling(jobGroupId);
          addNotification({
            text: `Successfully synced transactions! (${progress.completedBatches}/${progress.totalBatches} batches completed)`,
            type: NotificationType.success,
          });
          // Refresh transactions list
          queryClient.invalidateQueries({
            queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange],
          });
        } else if (progress.status === 'failed') {
          stopPolling(jobGroupId);
          addNotification({
            text: `Transaction sync failed (${progress.failedBatches} batches failed)`,
            type: NotificationType.error,
          });
        } else if (progress.status === 'active' || progress.status === 'waiting') {
          // Show progress update only when a new batch completes
          if (progress.completedBatches > lastNotifiedBatch && progress.completedBatches > 0) {
            lastNotifiedBatch = progress.completedBatches;
            addNotification({
              text: `Sync progress: ${progress.completedBatches}/${progress.totalBatches} batches completed`,
              type: NotificationType.info,
            });
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error polling job progress:', error);
        stopPolling(jobGroupId);
        addNotification({
          text: 'Failed to check sync progress',
          type: NotificationType.error,
        });
      }
    }, 5000); // Poll every 5 seconds

    // Auto-stop polling after 30 minutes
    const timeoutId = setTimeout(() => {
      stopPolling(jobGroupId);
      addNotification({
        text: 'Sync job polling timed out. Please refresh the page to check status.',
        type: NotificationType.warning,
      });
    }, 30 * 60 * 1000);

    activeJobs.value.set(jobGroupId, {
      jobGroupId,
      connectionId,
      pollInterval,
      timeoutId,
      lastNotifiedBatch,
    });
  };

  const stopPolling = (jobGroupId: string) => {
    const job = activeJobs.value.get(jobGroupId);
    if (job) {
      clearInterval(job.pollInterval);
      clearTimeout(job.timeoutId);
      activeJobs.value.delete(jobGroupId);
    }
  };

  const stopAllPolling = () => {
    activeJobs.value.forEach((job) => {
      clearInterval(job.pollInterval);
      clearTimeout(job.timeoutId);
    });
    activeJobs.value.clear();
  };

  return {
    startPolling,
    stopPolling,
    stopAllPolling,
    isJobActive,
    activeJobIds,
  };
}
