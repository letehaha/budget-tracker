import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { calculateRefAmountFromParams } from './calculate-ref-amount.utils';

describe('calculateRefAmountFromParams', () => {
  describe('useFloorAbs=true (default - regular transactions)', () => {
    it("rounds fractional cent results to nearest integer using banker's rounding", () => {
      // 205 cents * 0.5 = 102.5 → rounds to 102 (banker's rounding to even)
      const result = calculateRefAmountFromParams({
        amount: Money.fromCents(205),
        rate: 0.5,
      });
      expect(result.toCents()).toBe(102);
    });

    it('returns zero for zero amount', () => {
      const result = calculateRefAmountFromParams({
        amount: Money.zero(),
        rate: 1.5,
      });
      expect(result.toCents()).toBe(0);
    });

    it('preserves sign for negative amounts', () => {
      // -200 cents * 1.5 = -300 cents
      const result = calculateRefAmountFromParams({
        amount: Money.fromCents(-200),
        rate: 1.5,
      });
      expect(result.toCents()).toBe(-300);
    });
  });

  describe('useFloorAbs=false (investments - DECIMAL precision)', () => {
    // Reproduces FRONTEND-V2-XXX / MONEY-MATTER-BACKEND-5N:
    // "Money.fromCents: expected integer, got 128479.5" thrown during base
    // currency change for users with investment transactions whose
    // amountCents * rate produces a fractional result.
    it('does not throw when amountCents * rate produces a fractional cent', () => {
      // 205 cents * 0.5 = 102.5 (fractional) — must not throw
      expect(() =>
        calculateRefAmountFromParams({
          amount: Money.fromCents(205),
          rate: 0.5,
          useFloorAbs: false,
        }),
      ).not.toThrow();
    });

    it('preserves decimal precision instead of rounding to whole cents', () => {
      // 205 cents (= $2.05) * 0.5 = $1.025 — should keep the half-cent precision
      const result = calculateRefAmountFromParams({
        amount: Money.fromCents(205),
        rate: 0.5,
        useFloorAbs: false,
      });
      expect(result.toNumber()).toBe(1.025);
    });

    it('preserves sign for negative amounts with fractional results', () => {
      const result = calculateRefAmountFromParams({
        amount: Money.fromCents(-205),
        rate: 0.5,
        useFloorAbs: false,
      });
      expect(result.toNumber()).toBe(-1.025);
    });

    it('returns zero for zero amount', () => {
      const result = calculateRefAmountFromParams({
        amount: Money.zero(),
        rate: 1.5,
        useFloorAbs: false,
      });
      expect(result.toNumber()).toBe(0);
    });
  });
});
