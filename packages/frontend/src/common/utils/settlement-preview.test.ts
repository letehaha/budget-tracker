import { describe, expect, it } from 'vitest';

import { calculateSettlementPreview } from './settlement-preview';

describe('calculateSettlementPreview', () => {
  const buyBase = {
    isCashIn: false,
    quantity: '5',
    price: '92.07', // notional = 460.35
  };

  describe('fee mode (rate derived)', () => {
    it('derives the broker rate from total minus fee on BUY', () => {
      const preview = calculateSettlementPreview({
        ...buyBase,
        totalCash: '1700',
        mode: 'fee',
        fee: '15',
      });

      // rate = (1700 - 15) / 460.35
      expect(preview).not.toBeNull();
      expect(preview!.rate).toBeCloseTo(1685 / 460.35, 8);
      expect(preview!.fee).toBe(15);
    });

    it('derives the rate from total plus fee on SELL (fee deducted before payout)', () => {
      const preview = calculateSettlementPreview({
        isCashIn: true,
        quantity: '5',
        price: '100',
        totalCash: '1800',
        mode: 'fee',
        fee: '10',
      });

      expect(preview!.rate).toBeCloseTo(1810 / 500, 8);
      expect(preview!.fee).toBe(10);
    });

    it('treats an empty fee as zero (spread folds into the rate)', () => {
      const preview = calculateSettlementPreview({
        ...buyBase,
        totalCash: '1700',
        mode: 'fee',
        fee: '',
      });

      expect(preview!.rate).toBeCloseTo(1700 / 460.35, 8);
      expect(preview!.fee).toBe(0);
    });

    it('returns null when the fee exceeds the cash moved on BUY', () => {
      const preview = calculateSettlementPreview({
        ...buyBase,
        totalCash: '10',
        mode: 'fee',
        fee: '15',
      });

      expect(preview).toBeNull();
    });
  });

  describe('rate / auto modes (fee derived as residual)', () => {
    it('derives the fee from a known rate on BUY', () => {
      const preview = calculateSettlementPreview({
        ...buyBase,
        totalCash: '1700',
        mode: 'rate',
        rate: '3.66',
      });

      // fee = 1700 - 460.35 * 3.66 = 15.119
      expect(preview!.rate).toBe(3.66);
      expect(preview!.fee).toBeCloseTo(15.119, 6);
    });

    it('derives the fee from the market rate in auto mode (numeric rate)', () => {
      const preview = calculateSettlementPreview({
        ...buyBase,
        totalCash: '1709.14',
        mode: 'auto',
        rate: 3.682295,
      });

      // fee = 1709.14 - 460.35 * 3.682295 ≈ 14.0
      expect(preview!.rate).toBe(3.682295);
      expect(preview!.fee).toBeCloseTo(1709.14 - 460.35 * 3.682295, 6);
    });

    it('derives the fee from a known rate on SELL (received below gross)', () => {
      const preview = calculateSettlementPreview({
        isCashIn: true,
        quantity: '5',
        price: '100',
        totalCash: '1800',
        mode: 'rate',
        rate: '3.62',
      });

      // gross = 500 * 3.62 = 1810; fee = 1810 - 1800 = 10
      expect(preview!.rate).toBe(3.62);
      expect(preview!.fee).toBeCloseTo(10, 8);
    });

    it('clamps a negative residual to zero fee and folds it into the rate', () => {
      const preview = calculateSettlementPreview({
        ...buyBase,
        totalCash: '1700',
        mode: 'rate',
        rate: '4.105698', // market-priced notional ≈ 1890 > 1700 paid
      });

      expect(preview!.fee).toBe(0);
      expect(preview!.rate).toBeCloseTo(1700 / 460.35, 8);
    });

    it('returns null while the rate is missing (still loading)', () => {
      const preview = calculateSettlementPreview({
        ...buyBase,
        totalCash: '1700',
        mode: 'auto',
        rate: undefined,
      });

      expect(preview).toBeNull();
    });
  });

  describe('incomplete inputs', () => {
    it('returns null for empty total', () => {
      expect(
        calculateSettlementPreview({
          ...buyBase,
          totalCash: '',
          mode: 'fee',
          fee: '15',
        }),
      ).toBeNull();
    });

    it('returns null for zero notional', () => {
      expect(
        calculateSettlementPreview({
          isCashIn: false,
          quantity: '5',
          price: '0',
          totalCash: '1700',
          mode: 'rate',
          rate: '3.66',
        }),
      ).toBeNull();
    });
  });
});
