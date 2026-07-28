import { rateForDayOffset, toBaseCurrencyCents } from './fx';

describe('demo template fx curve', () => {
  describe('rateForDayOffset', () => {
    it("returns the spot rate for today, so the curve agrees with the user's stored rate", () => {
      expect(rateForDayOffset({ currencyCode: 'EUR', dayOffset: 0, spotRate: 0.92 })).toBe(0.92);
      expect(rateForDayOffset({ currencyCode: 'PLN', dayOffset: 0, spotRate: 4 })).toBe(4);
    });

    it('returns the spot rate unchanged for a currency with no configured drift', () => {
      expect(rateForDayOffset({ currencyCode: 'GBP', dayOffset: 400, spotRate: 0.79 })).toBe(0.79);
    });

    it('moves the rate away from spot on historical days', () => {
      const drifted = rateForDayOffset({ currencyCode: 'EUR', dayOffset: 100, spotRate: 0.92 });

      expect(drifted).not.toBe(0.92);
    });

    it('is deterministic, so every demo user sees the same history', () => {
      const first = rateForDayOffset({ currencyCode: 'PLN', dayOffset: 517, spotRate: 4 });
      const second = rateForDayOffset({ currencyCode: 'PLN', dayOffset: 517, spotRate: 4 });

      expect(first).toBe(second);
    });

    it('keeps three years of rates within a believable band of spot', () => {
      // Combined amplitude of both waves, which is the most the curve can swing.
      const maxDrift = { EUR: 0.05 + 0.015, PLN: 0.09 + 0.025 };

      for (const [currencyCode, spotRate] of [
        ['EUR', 0.92],
        ['PLN', 4],
      ] as const) {
        for (let dayOffset = 0; dayOffset <= 1100; dayOffset += 1) {
          const rate = rateForDayOffset({ currencyCode, dayOffset, spotRate });
          const deviation = Math.abs(rate - spotRate) / spotRate;

          expect(deviation).toBeLessThanOrEqual(maxDrift[currencyCode] + 1e-9);
          expect(rate).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('toBaseCurrencyCents', () => {
    it('passes the amount through when the currency has no rate (it is the base currency)', () => {
      expect(toBaseCurrencyCents({ amount: 4500, currencyCode: 'USD', dayOffset: 30, spotRate: undefined })).toBe(4500);
    });

    it('divides by the rate, since rates are quote units per base unit', () => {
      // 92 EUR cents at 0.92 EUR/USD is 100 USD cents.
      expect(toBaseCurrencyCents({ amount: 92, currencyCode: 'EUR', dayOffset: 0, spotRate: 0.92 })).toBe(100);
    });

    it('returns whole cents', () => {
      const converted = toBaseCurrencyCents({ amount: 7333, currencyCode: 'PLN', dayOffset: 245, spotRate: 4 });

      expect(Number.isInteger(converted)).toBe(true);
    });

    it('converts a weaker historical rate into more base currency than a stronger one', () => {
      const spotRate = 4;
      const amount = 10000;

      const strongDay = 95; // PLN short wave near its positive peak, so more PLN per USD.
      const weakDay = 285;

      const strong = toBaseCurrencyCents({ amount, currencyCode: 'PLN', dayOffset: strongDay, spotRate });
      const weak = toBaseCurrencyCents({ amount, currencyCode: 'PLN', dayOffset: weakDay, spotRate });

      expect(strong).not.toBe(weak);
    });
  });
});
