import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Importing the real queue module would construct a BullMQ queue + worker.
// (`@root/redis-client` is already stubbed globally in setupUnitTests.ts.)
jest.mock('./categorization-queue', () => ({
  __esModule: true,
  buildLastCategorizationJobPointerKey: (userId: number) => `ai-categorization-last-job-${userId}`,
  categorizationQueue: { getJob: jest.fn() },
}));

/* eslint-disable import/first */
import { logger } from '@js/utils/logger';
import { redisClient } from '@root/redis-client';

import { categorizationQueue } from './categorization-queue';
import { getCategorizationStatus } from './categorization-status.service';
/* eslint-enable import/first */

type AsyncMock = jest.Mock<(...args: never[]) => Promise<unknown>>;

const redisGetMock = jest.mocked(redisClient.get) as unknown as AsyncMock;
const getJobMock = jest.mocked(categorizationQueue.getJob) as unknown as AsyncMock;

const USER_ID = 42;
const JOB_ID = 'categorization-42-1234';
const IDLE = { status: 'idle' };

function mockJob({
  userId = USER_ID,
  transactionCount = 5,
  state = 'active',
  progress = {} as unknown,
}: {
  userId?: number;
  transactionCount?: number;
  state?: string;
  progress?: unknown;
} = {}) {
  getJobMock.mockResolvedValue({
    data: { userId, transactionIds: Array.from({ length: transactionCount }, (_, i) => `tx-${i}`) },
    progress,
    getState: jest.fn<() => Promise<string>>().mockResolvedValue(state),
  });
}

describe('getCategorizationStatus state mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisGetMock.mockResolvedValue(JOB_ID);
  });

  it('returns idle when no pointer exists', async () => {
    redisGetMock.mockResolvedValue(null);

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
    expect(getJobMock).not.toHaveBeenCalled();
  });

  it('returns idle when the pointer resolves to no job (run finished, job removed)', async () => {
    getJobMock.mockResolvedValue(null);

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
  });

  it("returns idle when the pointer resolves to another user's job, and reports the corrupted pointer", async () => {
    const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    mockJob({ userId: USER_ID + 1 });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
    // A per-user pointer resolving to a foreign job is our bug — it must reach
    // Sentry, not vanish behind the safe idle fallback.
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

  it.each(['waiting', 'delayed', 'prioritized'])('maps a %s job to queued', async (state) => {
    mockJob({ state });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual({
      status: 'queued',
      processedCount: 0,
      totalCount: 5,
      failedCount: 0,
    });
  });

  it('maps a failed job with a progress blob to failed, counting unprocessed transactions as failed', async () => {
    mockJob({ state: 'failed', progress: { processedCount: 2, totalCount: 5, failedCount: 1 } });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual({
      status: 'failed',
      processedCount: 2,
      totalCount: 5,
      failedCount: 4,
    });
  });

  it('maps a failed job without a progress blob to failed with everything failed', async () => {
    mockJob({ state: 'failed', progress: 0 });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual({
      status: 'failed',
      processedCount: 0,
      totalCount: 5,
      failedCount: 5,
    });
  });

  it('maps a completed job to idle (removeOnComplete normally deletes it first)', async () => {
    mockJob({ state: 'completed' });

    await expect(getCategorizationStatus({ userId: USER_ID })).resolves.toEqual(IDLE);
  });
});
