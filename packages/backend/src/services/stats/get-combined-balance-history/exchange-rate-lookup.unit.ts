import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@js/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// eslint-disable-next-line import/first
import { buildUserRatesMap, createFindLatestUsdRate, createGetExchangeRate } from './exchange-rate-lookup';

describe('buildUserRatesMap', () => {
  it('returns an empty map for an empty input', () => {
    expect(buildUserRatesMap([]).size).toBe(0);
  });

  it('indexes rates by `${baseCode}_${yyyy-MM-dd}`', () => {
    const map = buildUserRatesMap([{ baseCode: 'USD', quoteCode: 'AED', date: new Date('2024-05-10'), rate: 3.67 }]);
    expect(map.get('USD_2024-05-10')).toBe(3.67);
  });

  it('keeps the last-written value when two rows share a key', () => {
    const map = buildUserRatesMap([
      { baseCode: 'EUR', quoteCode: 'AED', date: new Date('2024-05-10'), rate: 4.0 },
      { baseCode: 'EUR', quoteCode: 'AED', date: new Date('2024-05-10'), rate: 4.1 },
    ]);
    expect(map.get('EUR_2024-05-10')).toBe(4.1);
  });

  it('handles string-form dates the same as Date inputs', () => {
    const map = buildUserRatesMap([
      { baseCode: 'GBP', quoteCode: 'USD', date: '2024-05-10' as unknown as Date, rate: 1.25 },
    ]);
    expect(map.get('GBP_2024-05-10')).toBe(1.25);
  });
});

describe('createFindLatestUsdRate', () => {
  const buildLookup = ({ datesByQuote }: { datesByQuote: Record<string, Array<{ date: string; rate: number }>> }) => {
    const usdRatesMap = new Map<string, number>();
    const usdRateDatesByQuote = new Map<string, string[]>();
    for (const [quote, rows] of Object.entries(datesByQuote)) {
      const dates: string[] = [];
      for (const r of rows) {
        usdRatesMap.set(`${quote}_${r.date}`, r.rate);
        dates.push(r.date);
      }
      usdRateDatesByQuote.set(quote, dates);
    }
    return { usdRatesMap, usdRateDatesByQuote };
  };

  it('short-circuits USD to 1 regardless of date', () => {
    const find = createFindLatestUsdRate(buildLookup({ datesByQuote: {} }));
    expect(find('USD', '2024-01-01')).toBe(1);
  });

  it('returns null when no rates exist for the currency', () => {
    const find = createFindLatestUsdRate(buildLookup({ datesByQuote: {} }));
    expect(find('AED', '2024-01-01')).toBeNull();
  });

  it('returns the exact-day rate when present', () => {
    const find = createFindLatestUsdRate(
      buildLookup({
        datesByQuote: {
          AED: [
            { date: '2024-01-10', rate: 3.6 },
            { date: '2024-01-15', rate: 3.7 },
          ],
        },
      }),
    );
    expect(find('AED', '2024-01-15')).toBe(3.7);
  });

  it('walks back to the most recent prior date when the exact day is missing', () => {
    const find = createFindLatestUsdRate(
      buildLookup({
        datesByQuote: {
          AED: [
            { date: '2024-01-10', rate: 3.6 },
            { date: '2024-01-12', rate: 3.65 },
            { date: '2024-01-20', rate: 3.7 },
          ],
        },
      }),
    );
    // 2024-01-15 has no rate; should fall back to 2024-01-12.
    expect(find('AED', '2024-01-15')).toBe(3.65);
  });

  it('returns null when every stored date is after the target date', () => {
    const find = createFindLatestUsdRate(
      buildLookup({
        datesByQuote: {
          AED: [
            { date: '2024-02-01', rate: 3.6 },
            { date: '2024-02-15', rate: 3.65 },
          ],
        },
      }),
    );
    expect(find('AED', '2024-01-10')).toBeNull();
  });

  it('still returns the latest prior rate when the target is far past the last stored date', () => {
    const find = createFindLatestUsdRate(
      buildLookup({
        datesByQuote: {
          AED: [
            { date: '2024-01-10', rate: 3.6 },
            { date: '2024-01-12', rate: 3.65 },
          ],
        },
      }),
    );
    expect(find('AED', '2025-12-31')).toBe(3.65);
  });
});

describe('createGetExchangeRate', () => {
  const makeGetExchangeRate = ({
    userBaseCurrencyCode,
    userRates = new Map<string, number>(),
    findLatestUsdRate,
  }: {
    userBaseCurrencyCode: string;
    userRates?: Map<string, number>;
    findLatestUsdRate: (quoteCode: string, dateStr: string) => number | null;
  }) => {
    const missingRateCurrencies: string[] = [];
    const get = createGetExchangeRate({
      userBaseCurrencyCode,
      userRatesMap: userRates,
      findLatestUsdRate,
      onMissingRate: (code) => missingRateCurrencies.push(code),
    });
    return { get, missingRateCurrencies };
  };

  it('short-circuits the user base currency to 1', () => {
    const { get } = makeGetExchangeRate({
      userBaseCurrencyCode: 'AED',
      findLatestUsdRate: () => null,
    });
    expect(get('AED', '2024-01-01')).toBe(1);
  });

  it('prefers a user override over the USD-pivot cross-rate', () => {
    const userRates = new Map<string, number>([['USD_2024-01-01', 10]]);
    const { get } = makeGetExchangeRate({
      userBaseCurrencyCode: 'AED',
      userRates,
      findLatestUsdRate: (q) => (q === 'USD' ? 4 : q === 'AED' ? 4 : null),
    });
    expect(get('USD', '2024-01-01')).toBe(10);
  });

  it('computes cross-rate via USD pivot when no override exists', () => {
    // USD→AED = 4, USD→EUR = 2 ⇒ EUR→AED = 4 / 2 = 2.
    const { get } = makeGetExchangeRate({
      userBaseCurrencyCode: 'AED',
      findLatestUsdRate: (q) => (q === 'AED' ? 4 : q === 'EUR' ? 2 : null),
    });
    expect(get('EUR', '2024-01-01')).toBe(2);
  });

  it('returns the canonical USD→base rate for a USD-currency value', () => {
    // USD→AED = 4, USD short-circuits to 1 ⇒ USD→AED = 4 / 1 = 4.
    const { get } = makeGetExchangeRate({
      userBaseCurrencyCode: 'AED',
      findLatestUsdRate: (q) => (q === 'AED' ? 4 : q === 'USD' ? 1 : null),
    });
    expect(get('USD', '2024-01-01')).toBe(4);
  });

  it('falls back to 1 and reports the missing currency when the USD-pivot lookup is empty for the value currency', () => {
    const { get, missingRateCurrencies } = makeGetExchangeRate({
      userBaseCurrencyCode: 'AED',
      findLatestUsdRate: (q) => (q === 'AED' ? 4 : null),
    });
    expect(get('XYZ', '2024-01-01')).toBe(1);
    expect(missingRateCurrencies).toEqual(['XYZ']);
  });

  it('falls back to 1 when the user base currency itself has no USD rate', () => {
    const { get, missingRateCurrencies } = makeGetExchangeRate({
      userBaseCurrencyCode: 'AED',
      findLatestUsdRate: (q) => (q === 'EUR' ? 2 : null),
    });
    expect(get('EUR', '2024-01-01')).toBe(1);
    expect(missingRateCurrencies).toEqual(['EUR']);
  });

  it('treats a stored zero USD-rate as missing rather than dividing by zero', () => {
    const { get, missingRateCurrencies } = makeGetExchangeRate({
      userBaseCurrencyCode: 'AED',
      findLatestUsdRate: (q) => (q === 'AED' ? 4 : q === 'EUR' ? 0 : null),
    });
    expect(get('EUR', '2024-01-01')).toBe(1);
    expect(missingRateCurrencies).toEqual(['EUR']);
  });
});
