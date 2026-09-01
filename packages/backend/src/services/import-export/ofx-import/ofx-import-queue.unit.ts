import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const enqueue = jest.fn<() => Promise<void>>();
const getImportProgress = jest.fn<() => Promise<null>>();
const claimOfxUpload = jest.fn<() => Promise<unknown>>();

jest.mock('@services/import-export/core/queue/create-import-job-queue', () => ({
  createImportJobQueue: () => ({ queue: {}, worker: {}, enqueue, getImportProgress }),
}));
jest.mock('./execute-import.service', () => ({ executeOfxImport: jest.fn() }));
jest.mock('./upload-cache', () => ({ claimOfxUpload: () => claimOfxUpload() }));

// eslint-disable-next-line import/first
import { queueOfxImport } from './ofx-import-queue';

const request = {
  userId: 1,
  uploadId: '71bbf0e3-82ba-4b12-a992-a9c83ae10ce0',
  accountMapping: {},
  skipDuplicateIndices: [],
};

describe('queueOfxImport', () => {
  beforeEach(() => {
    enqueue.mockReset();
    enqueue.mockResolvedValue();
    getImportProgress.mockReset();
    getImportProgress.mockResolvedValue(null);
    claimOfxUpload.mockReset();
    claimOfxUpload.mockResolvedValue({});
  });

  it('serializes claim and enqueue for the same OFX upload', async () => {
    let releaseFirstEnqueue!: () => void;
    const firstEnqueue = new Promise<void>((resolve) => {
      releaseFirstEnqueue = resolve;
    });
    enqueue.mockImplementationOnce(() => firstEnqueue);
    claimOfxUpload.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('already claimed'));

    const first = queueOfxImport(request);
    const second = queueOfxImport(request);
    await Promise.resolve();
    await Promise.resolve();

    expect(claimOfxUpload).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);

    releaseFirstEnqueue();
    await first;
    await expect(second).rejects.toThrow('already claimed');

    expect(claimOfxUpload).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
