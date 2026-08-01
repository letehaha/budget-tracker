import { CategorizationProgress } from './types';

/**
 * The job's progress blob is untyped on the BullMQ side (default is the number
 * 0); fall back to zeros when it's not the counters shape the worker writes.
 */
export function parseProgressCounters(
  progress: unknown,
): Pick<CategorizationProgress, 'processedCount' | 'failedCount'> {
  const raw = (typeof progress === 'object' && progress !== null ? progress : {}) as Partial<CategorizationProgress>;
  return {
    processedCount: typeof raw.processedCount === 'number' ? raw.processedCount : 0,
    failedCount: typeof raw.failedCount === 'number' ? raw.failedCount : 0,
  };
}

/**
 * Single projection of a failed run, shared by the worker's terminal SSE event
 * and the status endpoint so a live tab and a reloaded tab see the same
 * counters. A terminal failure means the processor threw, but batches finished
 * before the throw did commit — surface the blob's counters and count
 * everything that never ran as failed.
 */
export function buildFailedRunStatus({ progress, totalCount }: { progress: unknown; totalCount: number }): {
  status: 'failed';
  processedCount: number;
  totalCount: number;
  failedCount: number;
} {
  const { processedCount, failedCount } = parseProgressCounters(progress);
  return {
    status: 'failed',
    processedCount,
    totalCount,
    // Math.max keeps a counter bug (processedCount running past totalCount)
    // from turning the "never ran" remainder negative.
    failedCount: failedCount + Math.max(0, totalCount - processedCount),
  };
}
