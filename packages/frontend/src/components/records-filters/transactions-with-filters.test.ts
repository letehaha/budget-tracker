import { api } from '@/api/_api';
import { loadTransactions } from '@/api/transactions';
import { FILTER_OPERATION, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FILTERS, FiltersStruct, SELECTABLE_TRANSFER_NATURES } from './const';
import { buildIsPlannedParam, buildTransferNaturesParam, parseStoredFilters } from './transactions-with-filters';

vi.mock('@/api/_api', () => ({
  api: { get: vi.fn(() => Promise.resolve([])) },
}));

const apiGet = vi.mocked(api.get);

const makeFilters = (overrides: Partial<FiltersStruct> = {}): FiltersStruct => ({
  ...DEFAULT_FILTERS,
  ...overrides,
});

describe('buildTransferNaturesParam', () => {
  it('returns undefined when all natures are selected (no narrowing)', () => {
    expect(buildTransferNaturesParam(makeFilters())).toBeUndefined();
  });

  it('returns undefined when transfers are excluded entirely', () => {
    expect(
      buildTransferNaturesParam(
        makeFilters({
          transferFilter: FILTER_OPERATION.exclude,
          transferNatures: [TRANSACTION_TRANSFER_NATURE.common_transfer],
        }),
      ),
    ).toBeUndefined();
  });

  it('includes not_transfer alongside the selection when transfers are not "only"', () => {
    const result = buildTransferNaturesParam(
      makeFilters({
        transferNatures: [TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio],
      }),
    );

    expect(result).toEqual([
      TRANSACTION_TRANSFER_NATURE.not_transfer,
      TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
    ]);
  });

  it('omits not_transfer when the transfers toggle is "only"', () => {
    const result = buildTransferNaturesParam(
      makeFilters({
        transferFilter: FILTER_OPERATION.only,
        transferNatures: [TRANSACTION_TRANSFER_NATURE.common_transfer, TRANSACTION_TRANSFER_NATURE.transfer_out_wallet],
      }),
    );

    expect(result).toEqual([
      TRANSACTION_TRANSFER_NATURE.common_transfer,
      TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
    ]);
  });

  it('returns only not_transfer when no natures are selected and transfers are "all"', () => {
    const result = buildTransferNaturesParam(makeFilters({ transferNatures: [] }));

    expect(result).toEqual([TRANSACTION_TRANSFER_NATURE.not_transfer]);
  });

  it('treats a full manual selection the same as the default (no narrowing)', () => {
    const result = buildTransferNaturesParam(makeFilters({ transferNatures: [...SELECTABLE_TRANSFER_NATURES] }));

    expect(result).toBeUndefined();
  });
});

describe('buildIsPlannedParam', () => {
  it('returns undefined for "all" so both planned and real rows come back', () => {
    expect(buildIsPlannedParam({ value: FILTER_OPERATION.all })).toBeUndefined();
  });

  it('returns true for "only"', () => {
    expect(buildIsPlannedParam({ value: FILTER_OPERATION.only })).toBe(true);
  });

  it('returns false for "exclude"', () => {
    expect(buildIsPlannedParam({ value: FILTER_OPERATION.exclude })).toBe(false);
  });
});

describe('loadTransactions isPlanned query param', () => {
  beforeEach(() => {
    apiGet.mockClear();
  });

  const queryOf = (call: number = 0) => apiGet.mock.calls[call]![1] as Record<string, unknown>;

  // `false` is falsy and the api client strips falsy query values, so the
  // "exclude planned" filter only survives the trip as a string.
  it('sends "false" so the exclude-planned filter is not stripped', async () => {
    await loadTransactions({ isPlanned: buildIsPlannedParam({ value: FILTER_OPERATION.exclude }) });

    expect(queryOf()).toHaveProperty('isPlanned', 'false');
  });

  it('sends "true" for the only-planned filter', async () => {
    await loadTransactions({ isPlanned: buildIsPlannedParam({ value: FILTER_OPERATION.only }) });

    expect(queryOf()).toHaveProperty('isPlanned', 'true');
  });

  it('leaves isPlanned absent when the filter is not narrowing', async () => {
    await loadTransactions({ isPlanned: buildIsPlannedParam({ value: FILTER_OPERATION.all }) });

    expect(queryOf().isPlanned).toBeUndefined();
  });
});

describe('parseStoredFilters', () => {
  it('revives start/end dates and keeps sorting', () => {
    const raw = JSON.stringify({
      filters: { start: new Date('2026-01-01T00:00:00Z'), end: undefined, accountIds: ['a'] },
      sorting: { sortBy: 'time', order: 'ASC' },
    });
    const parsed = parseStoredFilters({ raw });
    expect(parsed?.filters.start).toBeInstanceOf(Date);
    expect(parsed?.filters.start?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed?.filters.accountIds).toEqual(['a']);
    expect(parsed?.sorting).toEqual({ sortBy: 'time', order: 'ASC' });
  });

  it('returns null for missing, malformed, or shapeless input', () => {
    expect(parseStoredFilters({ raw: null })).toBeNull();
    expect(parseStoredFilters({ raw: '{not json' })).toBeNull();
    expect(parseStoredFilters({ raw: '{"foo":1}' })).toBeNull();
  });
});
