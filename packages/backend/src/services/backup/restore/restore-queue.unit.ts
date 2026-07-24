import { API_ERROR_CODES } from '@bt/shared/types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LockedError } from '@js/errors';

// ── Mocks (inline jest.fn() so the hoisted factories never reach out-of-scope
//    vars; concrete mock refs are pulled back out with jest.mocked below) ──────

// Importing the module under test constructs a BullMQ queue + worker through this
// factory. Stub it so no real Redis connection / Worker is opened; the returned
// `queue` and `enqueue` are the seams these tests drive.
jest.mock('@services/import-export/core/queue/create-import-job-queue', () => ({
  __esModule: true,
  createImportJobQueue: jest.fn(() => ({
    queue: { getJob: jest.fn(), getJobs: jest.fn() },
    worker: {},
    enqueue: jest.fn(),
  })),
}));

// `@root/redis-client` opens a real ioredis connection at import; stub the
// key/value ops the module uses for the per-user last-restore pointer.
jest.mock('@root/redis-client', () => ({
  __esModule: true,
  redisClient: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  REDIS_KEY_PREFIX: undefined,
}));

// Only reached inside the worker body, which these unit tests never execute.
// Stub to keep the import graph off the DB / base-currency-lock machinery.
jest.mock('./restore-backup.service', () => ({ __esModule: true, restoreUserBackup: jest.fn() }));
jest.mock('@services/currencies/base-currency-lock', () => ({
  __esModule: true,
  acquireBaseCurrencyLock: jest.fn(),
  extendBaseCurrencyLockTtlIfOwned: jest.fn(),
  releaseBaseCurrencyLockIfOwned: jest.fn(),
}));
jest.mock('@i18n/index', () => ({ __esModule: true, t: jest.fn(() => 'translated') }));

/* eslint-disable import/first */
import { redisClient } from '@root/redis-client';
import { createImportJobQueue } from '@services/import-export/core/queue/create-import-job-queue';

import { queueBackupRestore } from './restore-queue';
/* eslint-enable import/first */

type AsyncMock = jest.Mock<(...args: never[]) => Promise<unknown>>;

// The queue + enqueue the module under test received from the (mocked) factory at
// load time. Captured once here (not per-test) so `clearAllMocks` — which wipes
// `mock.results` — can't strand the references.
const factoryBundle = jest.mocked(createImportJobQueue).mock.results[0]!.value as unknown as {
  queue: { getJob: AsyncMock; getJobs: AsyncMock };
  enqueue: AsyncMock;
};
const getJobsMock = factoryBundle.queue.getJobs;
const enqueueMock = factoryBundle.enqueue;
const redisSetMock = jest.mocked(redisClient.set) as unknown as AsyncMock;

const USER_ID = 42;
const FILE_CONTENT = 'base64-encoded-backup-zip';

beforeEach(() => {
  jest.clearAllMocks();
  redisSetMock.mockResolvedValue('OK');
  enqueueMock.mockResolvedValue(undefined);
});

describe('queueBackupRestore concurrent-restore enqueue guard', () => {
  it('throws LockedError and never enqueues when a restore is already in flight for the user', async () => {
    // An active/waiting/delayed job owned by the same user is already queued.
    getJobsMock.mockResolvedValue([{ data: { userId: USER_ID } }]);

    const promise = queueBackupRestore({ userId: USER_ID, fileContent: FILE_CONTENT });

    await expect(promise).rejects.toBeInstanceOf(LockedError);
    await expect(promise).rejects.toMatchObject({ code: API_ERROR_CODES.locked });

    // The guard fires before any pointer write or enqueue.
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
    // The in-flight lookup checks exactly the pre-pickup states.
    expect(getJobsMock).toHaveBeenCalledWith(['active', 'waiting', 'delayed']);
  });

  it('enqueues (writing the pointer and returning the job id) when no restore is in flight', async () => {
    getJobsMock.mockResolvedValue([]);

    const jobId = await queueBackupRestore({ userId: USER_ID, fileContent: FILE_CONTENT });

    // Job id is namespaced by the user and carries a random suffix.
    expect(jobId).toMatch(new RegExp(`^backup-restore-${USER_ID}-`));

    // Pointer is written (24h TTL) before the enqueue so a reloaded tab can resolve it.
    expect(redisSetMock).toHaveBeenCalledWith(`backup-restore-last-job-${USER_ID}`, jobId, 'EX', 24 * 3600);

    // The job is actually enqueued with the file content re-shipped in its data.
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      userId: USER_ID,
      jobId,
      data: { userId: USER_ID, fileContent: FILE_CONTENT },
    });
  });

  it("ignores another user's in-flight restore and enqueues normally", async () => {
    // A different user's job must not block this user's restore.
    getJobsMock.mockResolvedValue([{ data: { userId: USER_ID + 1 } }]);

    const jobId = await queueBackupRestore({ userId: USER_ID, fileContent: FILE_CONTENT });

    expect(jobId).toMatch(new RegExp(`^backup-restore-${USER_ID}-`));
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});
