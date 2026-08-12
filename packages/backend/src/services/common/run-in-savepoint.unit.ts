import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UniqueConstraintError } from 'sequelize';

// ── Mocks (hoisted before importing the module under test) ──────────────────

// Stand in for the managed savepoint transaction: run the callback, return its
// value on success, propagate its rejection on failure — exactly what a
// `ROLLBACK TO SAVEPOINT` + rethrow looks like to the caller.
const mockTransaction = jest.fn((_options: unknown, cb: () => Promise<unknown>) => cb());
const mockNamespaceGet = jest.fn<(key: string) => unknown>();

jest.mock('@models/connection', () => ({
  __esModule: true,
  connection: {
    sequelize: {
      transaction: (options: unknown, cb: () => Promise<unknown>) => mockTransaction(options, cb),
    },
  },
  namespace: {
    get: (key: string) => mockNamespaceGet(key),
  },
}));

// eslint-disable-next-line import/first
import { insertOrAdopt, runInSavepoint } from './run-in-savepoint';

const makeUniqueError = () => new UniqueConstraintError({});

beforeEach(() => {
  mockTransaction.mockClear();
  mockNamespaceGet.mockReset();
});

describe('runInSavepoint', () => {
  it('passes the ambient CLS transaction as the parent', async () => {
    const ambient = { finished: undefined };
    mockNamespaceGet.mockReturnValue(ambient);

    await runInSavepoint(() => Promise.resolve('ok'));

    expect(mockTransaction).toHaveBeenCalledWith({ transaction: ambient }, expect.any(Function));
  });

  it('opens a plain transaction when the ambient transaction is finished', async () => {
    mockNamespaceGet.mockReturnValue({ finished: 'commit' });

    await runInSavepoint(() => Promise.resolve('ok'));

    expect(mockTransaction).toHaveBeenCalledWith({}, expect.any(Function));
  });

  it('opens a plain transaction when no ambient transaction exists', async () => {
    mockNamespaceGet.mockReturnValue(undefined);

    await runInSavepoint(() => Promise.resolve('ok'));

    expect(mockTransaction).toHaveBeenCalledWith({}, expect.any(Function));
  });
});

describe('insertOrAdopt', () => {
  it('returns the inserted row and never consults adopt on success', async () => {
    const inserted = { id: 'inserted' };
    const adopt = jest.fn<() => Promise<{ id: string } | null>>();

    const result = await insertOrAdopt({
      insert: () => Promise.resolve(inserted),
      adopt,
    });

    expect(result).toBe(inserted);
    expect(adopt).not.toHaveBeenCalled();
  });

  it('adopts the winner row when the insert loses a UNIQUE race', async () => {
    const winner = { id: 'winner' };

    const result = await insertOrAdopt({
      insert: () => Promise.reject(makeUniqueError()),
      adopt: () => Promise.resolve(winner),
    });

    expect(result).toBe(winner);
  });

  it('rethrows the UNIQUE error when adopt finds no winner', async () => {
    const error = makeUniqueError();

    await expect(
      insertOrAdopt({
        insert: () => Promise.reject(error),
        adopt: () => Promise.resolve(null),
      }),
    ).rejects.toBe(error);
  });

  it('rethrows non-UNIQUE errors without consulting adopt', async () => {
    const error = new Error('boom');
    const adopt = jest.fn<() => Promise<{ id: string } | null>>();

    await expect(
      insertOrAdopt({
        insert: () => Promise.reject(error),
        adopt,
      }),
    ).rejects.toBe(error);
    expect(adopt).not.toHaveBeenCalled();
  });
});
