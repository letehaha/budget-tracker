import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Importing the real queue module would construct a BullMQ queue + worker.
// (`@root/redis-client` is already stubbed globally in setupUnitTests.ts.)
jest.mock('./categorization-queue', () => ({
  __esModule: true,
  buildLastCategorizationJobPointerKey: ({ userId }: { userId: number }) => `ai-categorization-last-job-${userId}`,
  categorizationQueue: { getJob: jest.fn() },
}));

/* eslint-disable import/first */
import { logger } from '@js/utils/logger';
import { redisClient } from '@root/redis-client';

import { categorizationQueue } from './categorization-queue';
import { getCategorizationStatus } from './categorization-status.service';
import { buildTerminalOutcomeKey } from './categorization-terminal-outcome';
/* eslint-enable import/first */

type AsyncMock = jest.Mock<(...args: never[]) => Promise<unknown>>;

const redisGetMock = jest.mocked(redisClient.get) as unknown as AsyncMock;
const redisDelMock = jest.mocked(redisClient.del) as unknown as AsyncMock;
const getJobMock = jest.mocked(categorizationQueue.getJob) as unknown as AsyncMock;

const USER_ID = 42;
const JOB_ID = 'categorization-42-1234';
const POINTER_KEY = `ai-categorization-last-job-${USER_ID}`;
const OUTCOME_KEY = buildTerminalOutcomeKey({ userId: USER_ID });
const IDLE = { status: 'idle' };

/** Per-key redis stub: the pointer and the terminal-outcome record share `redisClient.get`. */
function mockRedisKeys({ pointer, outcome }: { pointer: string | null; outcome: object | null }) {
  redisGetMock.mockImplementation((async (key: string) => {
    if (key === POINTER_KEY) return pointer;
    if (key === OUTCOME_KEY) return outcome ? JSON.stringify(outcome) : null;
    return null;
  }) as never);
}

function mockJob({
  userId = USER_ID,
  transactionCount = 5,
  state = 'active',
  progress = {} as unknown,
  failedReason,
}: {
  userId?: number;
  transactionCount?: number;
  state?: string;
  progress?: unknown;
  failedReason?: string;
} = {}) {
  getJobMock.mockResolvedValue({
    data: { userId, transactionIds: Array.from({ length: transactionCount }, (_, i) => `tx-${i}`) },
    progress,
    failedReason,
    getState: jest.fn<() => Promise<string>>().mockResolvedValue(state),
  });
}

describe('getCategorizationStatus state mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisKeys({ pointer: JOB_ID, outcome: null });
    redisDelMock.mockResolvedValue(1);
  });

  it('returns idle when no pointer exists', async () => {
    mockRedisKeys({ pointer: null, outcome: null });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
    expect(getJobMock).not.toHaveBeenCalled();
  });

  it('returns idle when the pointer resolves to no job and no terminal outcome was recorded', async () => {
    getJobMock.mockResolvedValue(null);

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
  });

  it("returns idle when the pointer resolves to another user's job, and reports the corrupted pointer", async () => {
    const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    mockJob({ userId: USER_ID + 1 });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
    // A foreign job on a per-user pointer is our bug, so it must reach Sentry.
    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    loggerErrorSpy.mockRestore();
  });

  it('maps an active job with a progress blob to processing with its counters', async () => {
    mockJob({ state: 'active', progress: { processedCount: 500, totalCount: 1500, failedCount: 2 } });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual({
      status: 'processing',
      processedCount: 500,
      totalCount: 5,
      failedCount: 2,
    });
  });

  it('maps an active job with default numeric progress to processing with zeroed counters', async () => {
    // BullMQ's default progress is the number 0, not an object
    mockJob({ state: 'active', progress: 0 });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual({
      status: 'processing',
      processedCount: 0,
      totalCount: 5,
      failedCount: 0,
    });
  });

  it.each(['waiting', 'prioritized'])('maps a %s job to queued', async (state) => {
    mockJob({ state, progress: 0 });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual({
      status: 'queued',
      processedCount: 0,
      totalCount: 5,
      failedCount: 0,
    });
  });

  it('keeps the progress counters through a retry backoff instead of resetting to zero', async () => {
    // `delayed` = attempt failed, retry pending; the blob still holds the finished batches.
    mockJob({ state: 'delayed', progress: { processedCount: 500, failedCount: 3 } });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual({
      status: 'queued',
      processedCount: 500,
      totalCount: 5,
      failedCount: 3,
    });
  });

  describe('terminal outcomes (consume-on-read)', () => {
    const FAILED_OUTCOME = {
      status: 'failed',
      processedCount: 2,
      totalCount: 5,
      failedCount: 4,
      errorMessage: 'job stalled more than allowable limit',
    };

    it('serves the recorded outcome once when the finished job is already gone', async () => {
      mockRedisKeys({ pointer: JOB_ID, outcome: FAILED_OUTCOME });
      getJobMock.mockResolvedValue(null);

      await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(FAILED_OUTCOME);
      expect(redisDelMock).toHaveBeenCalledWith(OUTCOME_KEY);
    });

    it('serves a completed-with-cause outcome for an early-stopped run', async () => {
      const stoppedOutcome = {
        status: 'completed',
        processedCount: 5,
        totalCount: 5,
        failedCount: 5,
        errorMessage: 'Your custom AI endpoint did not respond.',
      };
      mockRedisKeys({ pointer: JOB_ID, outcome: stoppedOutcome });
      getJobMock.mockResolvedValue(null);

      await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(stoppedOutcome);
    });

    it('serves the recorded outcome once while the failed job still lingers in the queue', async () => {
      mockRedisKeys({ pointer: JOB_ID, outcome: FAILED_OUTCOME });
      mockJob({ state: 'failed', progress: { processedCount: 2, failedCount: 1 } });

      await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(FAILED_OUTCOME);
    });

    it('settles a lingering failed job to idle after the outcome was consumed', async () => {
      mockJob({ state: 'failed', progress: { processedCount: 2, failedCount: 1 } });

      await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
    });

    it('returns idle for a malformed outcome record instead of throwing', async () => {
      redisGetMock.mockImplementation((async (key: string) => {
        if (key === POINTER_KEY) return JOB_ID;
        if (key === OUTCOME_KEY) return 'not-json{';
        return null;
      }) as never);
      getJobMock.mockResolvedValue(null);

      await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
    });
  });
});
