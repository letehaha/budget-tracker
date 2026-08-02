import { CategorizationProgress } from './types';

/**
 * BullMQ's progress blob is untyped and defaults to the number 0, so anything
 * that isn't the counters shape the worker writes reads as zeros.
 */
export function parseProgressCounters({
  progress,
}: {
  progress: unknown;
}): Pick<CategorizationProgress, 'processedCount' | 'failedCount'> {
  const raw = (typeof progress === 'object' && progress !== null ? progress : {}) as Partial<CategorizationProgress>;
  return {
    processedCount: typeof raw.processedCount === 'number' ? raw.processedCount : 0,
    failedCount: typeof raw.failedCount === 'number' ? raw.failedCount : 0,
  };
}

/**
 * A failed run still committed the batches that finished before the throw, so
 * the blob's counters stand and only the remainder counts as failed.
 */
export function buildFailedRunStatus({
  progress,
  totalCount,
  errorMessage,
}: {
  progress: unknown;
  totalCount: number;
  errorMessage?: string;
}): {
  status: 'failed';
  processedCount: number;
  totalCount: number;
  failedCount: number;
  errorMessage?: string;
} {
  const { processedCount, failedCount } = parseProgressCounters({ progress });
  return {
    status: 'failed',
    processedCount,
    totalCount,
    // Math.max stops an overcounted processedCount from making the remainder negative.
    failedCount: failedCount + Math.max(0, totalCount - processedCount),
    ...(errorMessage ? { errorMessage } : {}),
  };
}
