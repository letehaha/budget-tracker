import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { Op } from 'sequelize';

import {
  balanceAdjustmentsWhere,
  capPolicy,
  completenessToPagination,
  composeWhere,
  plannedWhere,
  transfersWhere,
} from './where-builders';

const NOT_BALANCE_ADJUSTMENT_SQL = `("Transactions"."externalData" IS NULL OR NOT ("Transactions"."externalData" @> '{"balanceAdjustment": true}'))`;

const orBranches = (fragment: unknown): unknown => (fragment as { [Op.or]: unknown })[Op.or];

const literalSql = (fragment: unknown): string => (fragment as { val: string }).val;

const isEmptyObject = (fragment: object): boolean =>
  Object.keys(fragment).length === 0 && Object.getOwnPropertySymbols(fragment).length === 0;

describe('plannedWhere', () => {
  it('excludes planned rows', () => {
    expect(plannedWhere({ policy: 'exclude' })).toEqual({ isPlanned: false });
  });

  it('keeps planned rows only', () => {
    expect(plannedWhere({ policy: 'only' })).toEqual({ isPlanned: true });
  });

  it('produces an empty fragment for "include"', () => {
    expect(isEmptyObject(plannedWhere({ policy: 'include' }))).toBe(true);
  });

  it("maps { visibleTo } to real rows OR the user's own plans", () => {
    expect(orBranches(plannedWhere({ policy: { visibleTo: 42 } }))).toEqual([{ isPlanned: false }, { userId: 42 }]);
  });
});

describe('balanceAdjustmentsWhere', () => {
  it('produces an empty fragment for "include"', () => {
    expect(isEmptyObject(balanceAdjustmentsWhere({ policy: 'include' }))).toBe(true);
  });

  it('excludes balance-adjustment rows while keeping rows without externalData', () => {
    expect(literalSql(balanceAdjustmentsWhere({ policy: 'exclude' }))).toBe(NOT_BALANCE_ADJUSTMENT_SQL);
  });
});

describe('transfersWhere', () => {
  const transferNatureOp = (fragment: unknown, op: symbol): unknown =>
    (fragment as { transferNature: Record<symbol, unknown> }).transferNature[op];

  it('produces an empty fragment for "include"', () => {
    expect(isEmptyObject(transfersWhere({ policy: 'include' }))).toBe(true);
  });

  it('produces an empty fragment when no policy is stated', () => {
    expect(isEmptyObject(transfersWhere({ policy: undefined }))).toBe(true);
  });

  it('keeps non-transfer rows only', () => {
    expect(transfersWhere({ policy: 'exclude' })).toEqual({
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    });
  });

  it('keeps transfer legs of any nature', () => {
    expect(transferNatureOp(transfersWhere({ policy: 'only' }), Op.ne)).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('narrows to the requested natures', () => {
    const natures = [TRANSACTION_TRANSFER_NATURE.transfer_out_wallet, TRANSACTION_TRANSFER_NATURE.transfer_to_loan];

    expect(transferNatureOp(transfersWhere({ policy: { natures } }), Op.in)).toEqual(natures);
  });
});

describe('composeWhere', () => {
  it("keeps a caller's Op.or and the visibleTo Op.or side by side", () => {
    const callerWhere = { [Op.or]: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] };

    const composed = composeWhere({ fragments: [plannedWhere({ policy: { visibleTo: 7 } })], where: callerWhere });

    expect(composed[Op.and]).toHaveLength(2);
    expect(orBranches(composed[Op.and][0])).toEqual([{ isPlanned: false }, { userId: 7 }]);
    expect(orBranches(composed[Op.and][1])).toEqual([{ accountId: 'acc-1' }, { accountId: 'acc-2' }]);
  });

  it('never merges a policy key into a colliding caller key', () => {
    const composed = composeWhere({ fragments: [{ userId: 1 }], where: { userId: 2 } });

    expect(composed[Op.and]).toEqual([{ userId: 1 }, { userId: 2 }]);
  });

  it('drops empty fragments produced by "include" policies', () => {
    const composed = composeWhere({
      fragments: [plannedWhere({ policy: 'include' }), balanceAdjustmentsWhere({ policy: 'include' })],
    });

    expect(composed[Op.and]).toEqual([]);
  });

  it('keeps the caller where untouched and unmerged', () => {
    const callerWhere = { note: 'lunch' };

    const composed = composeWhere({ fragments: [plannedWhere({ policy: 'exclude' })], where: callerWhere });

    expect(composed[Op.and][1]).toBe(callerWhere);
    expect(callerWhere).toEqual({ note: 'lunch' });
  });

  it('composes policy fragments before the caller where, in policy order', () => {
    const composed = composeWhere({
      fragments: [plannedWhere({ policy: 'exclude' }), { userId: 5 }, balanceAdjustmentsWhere({ policy: 'exclude' })],
      where: { categoryId: 'cat-1' },
    });

    expect(composed[Op.and]).toHaveLength(4);
    expect(composed[Op.and][0]).toEqual({ isPlanned: false });
    expect(composed[Op.and][1]).toEqual({ userId: 5 });
    expect(literalSql(composed[Op.and][2])).toBe(NOT_BALANCE_ADJUSTMENT_SQL);
    expect(composed[Op.and][3]).toEqual({ categoryId: 'cat-1' });
  });
});

describe('completenessToPagination', () => {
  it('maps "all" to no limit and no offset', () => {
    expect(completenessToPagination({ completeness: 'all' })).toEqual({});
  });

  it('maps "probe" to limit 1', () => {
    expect(completenessToPagination({ completeness: 'probe' })).toEqual({ limit: 1 });
  });

  it('maps { page } to limit + offset', () => {
    expect(completenessToPagination({ completeness: { page: { offset: 40, limit: 20 } } })).toEqual({
      limit: 20,
      offset: 40,
    });
  });

  it('maps { cap } to limit only', () => {
    expect(completenessToPagination({ completeness: { cap: { limit: 5000, onTruncated: 'log' } } })).toEqual({
      limit: 5000,
    });
  });
});

describe('capPolicy', () => {
  it('returns the cap, including the log context the caller attached', () => {
    const cap = { limit: 10, onTruncated: 'log', context: { userId: 42 } } as const;

    expect(capPolicy({ completeness: { cap } })).toBe(cap);
  });

  it('returns null for "all" and "probe"', () => {
    expect(capPolicy({ completeness: 'all' })).toBeNull();
    expect(capPolicy({ completeness: 'probe' })).toBeNull();
  });

  it('returns null for pagination', () => {
    expect(capPolicy({ completeness: { page: { offset: 0, limit: 20 } } })).toBeNull();
  });
});
