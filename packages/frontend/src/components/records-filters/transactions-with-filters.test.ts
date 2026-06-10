import { FILTER_OPERATION, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { DEFAULT_FILTERS, FiltersStruct, SELECTABLE_TRANSFER_NATURES } from './const';
import { buildTransferNaturesParam } from './transactions-with-filters';

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
