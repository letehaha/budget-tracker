import { exceedsMaxDecimals, trimTrailingZeros } from './precision-number';

describe('trimTrailingZeros', () => {
  it('drops trailing zeros from the fractional part', () => {
    expect(trimTrailingZeros('-0.0004920000')).toBe('-0.000492');
    expect(trimTrailingZeros('5418.0000000000')).toBe('5418');
    expect(trimTrailingZeros('1.2300')).toBe('1.23');
  });

  it('leaves integer strings untouched', () => {
    expect(trimTrailingZeros('5418')).toBe('5418');
    expect(trimTrailingZeros('0')).toBe('0');
    expect(trimTrailingZeros('-42')).toBe('-42');
  });
});

describe('exceedsMaxDecimals', () => {
  it('returns true when more decimals than allowed', () => {
    expect(exceedsMaxDecimals({ value: '-0.000492', maxDecimals: 4 })).toBe(true);
    expect(exceedsMaxDecimals({ value: '1.234', maxDecimals: 2 })).toBe(true);
  });

  it('returns false when within the limit (counting only significant decimals)', () => {
    expect(exceedsMaxDecimals({ value: '1.23', maxDecimals: 2 })).toBe(false);
    expect(exceedsMaxDecimals({ value: '5418', maxDecimals: 4 })).toBe(false);
    expect(exceedsMaxDecimals({ value: '5418.0000', maxDecimals: 4 })).toBe(false);
  });
});
