import { vi } from 'vitest';

// Mock BullMQ before importing anything that touches it
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' } as never),
    on: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
  })),
}));

vi.mock('./categorization-service', () => ({
  categorizeTransactions: vi.fn(),
}));

vi.mock('./categorization-queue', () => ({
  queueCategorizationJob: vi.fn().mockResolvedValue('test-job-id' as never),
}));

import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';

import { queueCategorizationJob } from './categorization-queue';
import { flushAllPendingCategorizationBuffers, registerAiCategorizationListeners } from './event-listeners';

const mockedQueueCategorizationJob = vi.mocked(queueCategorizationJob);

describe('event-listeners debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    registerAiCategorizationListeners();
  });

  afterEach(async () => {
    await flushAllPendingCategorizationBuffers();
    eventBus.removeAllListeners(DOMAIN_EVENTS.TRANSACTIONS_SYNCED);
    vi.useRealTimers();
  });

  it('does not queue immediately on event — waits for debounce', () => {
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [100, 101],
    });

    expect(mockedQueueCategorizationJob).not.toHaveBeenCalled();
  });

  it('queues after debounce timer fires', () => {
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [100, 101],
    });

    vi.advanceTimersByTime(4000);

    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(1);
    expect(mockedQueueCategorizationJob).toHaveBeenCalledWith({
      userId: 1,
      transactionIds: [100, 101],
    });
  });

  it('batches multiple events for the same user within the debounce window', () => {
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [100, 101],
    });

    vi.advanceTimersByTime(1000);

    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 20,
      transactionIds: [200, 201, 202],
    });

    vi.advanceTimersByTime(1000);

    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 30,
      transactionIds: [300],
    });

    // Not yet — timer resets on each event
    vi.advanceTimersByTime(3999);
    expect(mockedQueueCategorizationJob).not.toHaveBeenCalled();

    // Now the 4s after the last event fires
    vi.advanceTimersByTime(1);

    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(1);
    expect(mockedQueueCategorizationJob).toHaveBeenCalledWith({
      userId: 1,
      transactionIds: [100, 101, 200, 201, 202, 300],
    });
  });

  it('keeps separate buffers per user', () => {
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [100],
    });

    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 2,
      accountId: 20,
      transactionIds: [200],
    });

    vi.advanceTimersByTime(4000);

    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(2);
    expect(mockedQueueCategorizationJob).toHaveBeenCalledWith({
      userId: 1,
      transactionIds: [100],
    });
    expect(mockedQueueCategorizationJob).toHaveBeenCalledWith({
      userId: 2,
      transactionIds: [200],
    });
  });

  it('ignores events with empty transactionIds', () => {
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [],
    });

    vi.advanceTimersByTime(4000);

    expect(mockedQueueCategorizationJob).not.toHaveBeenCalled();
  });

  it('late events after debounce fires create a new batch', () => {
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [100],
    });

    vi.advanceTimersByTime(4000);

    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(1);
    expect(mockedQueueCategorizationJob).toHaveBeenCalledWith({
      userId: 1,
      transactionIds: [100],
    });

    // Late event (e.g., Monobank rate-limited account syncing later)
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 20,
      transactionIds: [200, 201],
    });

    vi.advanceTimersByTime(4000);

    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(2);
    expect(mockedQueueCategorizationJob).toHaveBeenLastCalledWith({
      userId: 1,
      transactionIds: [200, 201],
    });
  });

  it('flushAllPendingCategorizationBuffers flushes immediately without waiting', async () => {
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [100],
    });

    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 2,
      accountId: 20,
      transactionIds: [200],
    });

    // Flush without advancing timers
    await flushAllPendingCategorizationBuffers();

    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(2);

    // Advancing timers should NOT trigger another flush
    vi.advanceTimersByTime(4000);
    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(2);
  });

  it('does not queue if queueCategorizationJob throws', async () => {
    mockedQueueCategorizationJob.mockRejectedValueOnce(new Error('Redis down'));

    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, {
      userId: 1,
      accountId: 10,
      transactionIds: [100],
    });

    // Should not throw — error is caught and logged
    vi.advanceTimersByTime(4000);
    await vi.runAllTimersAsync();

    expect(mockedQueueCategorizationJob).toHaveBeenCalledTimes(1);
  });
});
