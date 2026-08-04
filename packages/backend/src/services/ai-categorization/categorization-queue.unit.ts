import { CATEGORIZATION_TRIGGER } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { redisClient } from '@root/redis-client';

// Must import after mocking
import { categorizationQueue, queueCategorizationJob } from './categorization-queue';
import { CATEGORIZATION_SCOPE } from './categorization-scope';

// Mock BullMQ before importing the module under test
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'test-job-id' } as never),
    on: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

// Mock the categorization service to avoid DB dependencies
jest.mock('./categorization-service', () => ({
  categorizeTransactions: jest.fn(),
}));

type AsyncMock = jest.Mock<(...args: never[]) => Promise<unknown>>;

const redisSetMock = jest.mocked(redisClient.set) as unknown as AsyncMock;

describe('categorization-queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisSetMock.mockResolvedValue('OK');
  });

  describe('queueCategorizationJob', () => {
    it('returns empty string for empty transactionIds', async () => {
      const result = await queueCategorizationJob({
        userId: 1,
        transactionIds: [],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });

      expect(result).toBe('');
      expect(categorizationQueue.add).not.toHaveBeenCalled();
      expect(redisSetMock).not.toHaveBeenCalled();
    });

    it('writes the last-job pointer so the status endpoint can rehydrate a reloaded page', async () => {
      const jobId = await queueCategorizationJob({
        userId: 123,
        transactionIds: [generateRandomRecordId()],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });

      expect(redisSetMock).toHaveBeenCalledWith('ai-categorization-last-job-123', jobId, 'EX', 24 * 3600);
    });

    it('overwrites the pointer with the newest job on overlapping runs (last-writer-wins)', async () => {
      const first = await queueCategorizationJob({
        userId: 123,
        transactionIds: [generateRandomRecordId()],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });
      // Job IDs are timestamp-based; a tick apart guarantees distinct IDs.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await queueCategorizationJob({
        userId: 123,
        transactionIds: [generateRandomRecordId()],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });

      expect(second).not.toBe(first);
      // Plain SET (no NX): the pointer must track the newest run even while an older one is in flight.
      expect(redisSetMock).toHaveBeenLastCalledWith('ai-categorization-last-job-123', second, 'EX', 24 * 3600);
    });

    it('still enqueues when the pointer write fails', async () => {
      redisSetMock.mockRejectedValue(new Error('redis down'));

      const jobId = await queueCategorizationJob({
        userId: 123,
        transactionIds: [generateRandomRecordId()],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });

      expect(jobId).toMatch(/^categorization-123-\d+$/);
      expect(categorizationQueue.add).toHaveBeenCalledTimes(1);
    });

    it('adds job to queue with correct data', async () => {
      const userId = 123;
      const transactionIds = [generateRandomRecordId(), generateRandomRecordId(), generateRandomRecordId()];
      const scope = CATEGORIZATION_SCOPE.defaultCategoryOnly;
      const trigger = CATEGORIZATION_TRIGGER.manual;

      await queueCategorizationJob({ userId, transactionIds, scope, trigger });

      // The scope rides along so the worker selects and writes back through the predicate
      // the entry point intended; the trigger rides along so the stamps can say what
      // started the run.
      expect(categorizationQueue.add).toHaveBeenCalledWith(
        expect.stringContaining('categorization-123-'),
        { userId, transactionIds, scope, trigger },
        expect.objectContaining({
          jobId: expect.stringContaining('categorization-123-'),
        }),
      );
    });

    it('returns job ID', async () => {
      const result = await queueCategorizationJob({
        userId: 456,
        transactionIds: [generateRandomRecordId(), generateRandomRecordId()],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });

      expect(result).toMatch(/^categorization-456-\d+$/);
    });

    it('generates unique job IDs based on timestamp', async () => {
      const result1 = await queueCategorizationJob({
        userId: 1,
        transactionIds: [generateRandomRecordId()],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result2 = await queueCategorizationJob({
        userId: 1,
        transactionIds: [generateRandomRecordId()],
        scope: CATEGORIZATION_SCOPE.anyCategory,
        trigger: CATEGORIZATION_TRIGGER.sync,
      });

      expect(result1).not.toBe(result2);
    });
  });
});
