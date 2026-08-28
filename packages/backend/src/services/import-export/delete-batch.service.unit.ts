import { beforeEach, describe, expect, it, jest } from '@jest/globals';

interface MockRow {
  id: string;
  accountId: string;
  transferId?: string | null;
  transferNature?: string;
}

const findWithFiltersMock = jest.fn<() => Promise<MockRow[]>>();
const accountsFindAllMock = jest.fn<() => Promise<{ id: string; type: string }[]>>();
const transactionsFindAllMock = jest.fn<() => Promise<{ id: string; transferId: string }[]>>();
const updateTransactionsMock = jest.fn<(params: unknown) => Promise<unknown>>();
const bulkDeleteMock =
  jest.fn<
    (params: { userId: number; transactionIds: string[] }) => Promise<{ deletedCount: number; deletedIds: string[] }>
  >();
const captureExceptionMock = jest.fn<(...args: unknown[]) => void>();

jest.mock('@models/transactions.model', () => ({
  __esModule: true,
  findWithFilters: () => findWithFiltersMock(),
}));

jest.mock('@models/transactions-query', () => ({
  __esModule: true,
  findTransactions: () => transactionsFindAllMock(),
  updateTransactions: (params: unknown) => updateTransactionsMock(params),
}));

jest.mock('@models/accounts.model', () => ({
  __esModule: true,
  default: { findAll: () => accountsFindAllMock() },
}));

jest.mock('@services/transactions/bulk-delete', () => ({
  __esModule: true,
  bulkDelete: (params: { userId: number; transactionIds: string[] }) => bulkDeleteMock(params),
}));

jest.mock('@js/utils/sentry', () => ({
  __esModule: true,
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

// The real wrapper needs a DB connection this unit test has none of. Running the body
// straight through is what a committed run looks like to the caller.
jest.mock('@services/common/with-transaction', () => ({
  __esModule: true,
  withTransaction: <T extends unknown[], R>(fn: (...args: T) => Promise<R>) => fn,
}));

/* eslint-disable import/first */
import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';

import { deleteImportBatch } from './delete-batch.service';
/* eslint-enable import/first */

const USER_ID = 1;
const BATCH_ID = 'batch-1';

function mockRows(count: number) {
  findWithFiltersMock.mockResolvedValue(
    Array.from({ length: count }, (_, i) => ({ id: `tx-${i}`, accountId: 'acc-1' })),
  );
}

describe('deleteImportBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accountsFindAllMock.mockResolvedValue([{ id: 'acc-1', type: 'system' }]);
  });

  it('rejects and captures a Sentry exception when the batch exceeds the delete cap', async () => {
    mockRows(1001);

    await expect(deleteImportBatch({ userId: USER_ID, batchId: BATCH_ID })).rejects.toThrow();

    expect(bulkDeleteMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('deletes an at-cap batch in a single bulkDelete call', async () => {
    mockRows(1000);

    const result = await deleteImportBatch({ userId: USER_ID, batchId: BATCH_ID });

    expect(bulkDeleteMock).toHaveBeenCalledTimes(1);
    expect(bulkDeleteMock.mock.calls[0]![0].transactionIds).toHaveLength(1000);
    expect(result.deletedCount).toBe(1000);
    expect(result.deletedIds).toHaveLength(1000);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('reports every batch row as deleted even when bulkDelete skips a cascade-deleted intra-batch twin', async () => {
    findWithFiltersMock.mockResolvedValue([
      {
        id: 'tx-0',
        accountId: 'acc-1',
        transferId: 'transfer-1',
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      },
      {
        id: 'tx-1',
        accountId: 'acc-1',
        transferId: 'transfer-1',
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      },
    ]);
    transactionsFindAllMock.mockResolvedValue([
      { id: 'tx-0', transferId: 'transfer-1' },
      { id: 'tx-1', transferId: 'transfer-1' },
    ]);
    bulkDeleteMock.mockResolvedValue({ deletedCount: 1, deletedIds: ['tx-0'] });

    const result = await deleteImportBatch({ userId: USER_ID, batchId: BATCH_ID });

    expect(bulkDeleteMock).toHaveBeenCalledTimes(1);
    expect(updateTransactionsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 2, deletedIds: ['tx-0', 'tx-1'] });
  });

  it('rejects, without mutating anything, when a batch leg is linked to a loan payment outside the batch', async () => {
    findWithFiltersMock.mockResolvedValue([
      {
        id: 'tx-0',
        accountId: 'acc-1',
        transferId: 'transfer-1',
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      },
    ]);
    transactionsFindAllMock.mockResolvedValue([
      { id: 'tx-0', transferId: 'transfer-1' },
      { id: 'loan-payment-outside-batch', transferId: 'transfer-1' },
    ]);

    await expect(deleteImportBatch({ userId: USER_ID, batchId: BATCH_ID })).rejects.toThrow();

    expect(updateTransactionsMock).not.toHaveBeenCalled();
    expect(bulkDeleteMock).not.toHaveBeenCalled();
  });
});
