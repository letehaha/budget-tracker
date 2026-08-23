import { VENTURE_DEAL_STATUS } from '@bt/shared/types/venture';
import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';
import VentureDeals from '@models/venture/venture-deals.model';

import { computeIrr } from './compute-irr';

describe('computeIrr', () => {
  it('all cash-flow points on the same day → null', () => {
    const deal = {
      id: 'deal-1',
      status: VENTURE_DEAL_STATUS.outstanding,
      investmentDate: '2026-05-10',
      principal: Money.fromDecimal('10000'),
      entryFee: Money.fromDecimal('0'),
    } as unknown as VentureDeals;

    const result = computeIrr({
      deal,
      events: [],
      currentValue: '12000',
      asOfDate: new Date('2026-05-10T18:00:00.000Z'),
    });

    expect(result).toBeNull();
  });
});
