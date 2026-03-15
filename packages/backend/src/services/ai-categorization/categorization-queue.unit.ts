import { beforeEach, describe, expect, it, vi } from 'vitest';

// Must import after mocking
import { categorizationQueue, queueCategorizationJob } from './categorization-queue';

// Mock BullMQ before importing the module under test
vi.mock('bullmq', () => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'test-job-id' } as never);
  const mockOn = vi.fn();
  return {
    Queue: class MockQueue {
      add = mockAdd;
      on = mockOn;
    },
    Worker: class MockWorker {
      on = vi.fn();
    },
  };
});

// Mock the categorization service to avoid DB dependencies
vi.mock('./categorization-service', () => ({
  categorizeTransactions: vi.fn(),
}));

describe('categorization-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queueCategorizationJob', () => {
    it('returns empty string for empty transactionIds', async () => {
      const result = await queueCategorizationJob({
        userId: 1,
        transactionIds: [],
      });

      expect(result).toBe('');
      expect(categorizationQueue.add).not.toHaveBeenCalled();
    });

    it('adds job to queue with correct data', async () => {
      const userId = 123;
      const transactionIds = [1, 2, 3];

      await queueCategorizationJob({ userId, transactionIds });

      expect(categorizationQueue.add).toHaveBeenCalledWith(
        expect.stringContaining('categorization-123-'),
        { userId, transactionIds },
        expect.objectContaining({
          jobId: expect.stringContaining('categorization-123-'),
        }),
      );
    });

    it('returns job ID', async () => {
      const result = await queueCategorizationJob({
        userId: 456,
        transactionIds: [10, 20],
      });

      expect(result).toMatch(/^categorization-456-\d+$/);
    });

    it('generates unique job IDs based on timestamp', async () => {
      const result1 = await queueCategorizationJob({
        userId: 1,
        transactionIds: [1],
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result2 = await queueCategorizationJob({
        userId: 1,
        transactionIds: [2],
      });

      expect(result1).not.toBe(result2);
    });
  });
});
