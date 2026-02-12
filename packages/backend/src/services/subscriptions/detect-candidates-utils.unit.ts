import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import {
  type TransactionForGrouping,
  isFuzzyNameMatch,
  mapIntervalToFrequency,
  normalizeNote,
  splitByAmountBuckets,
} from './detect-candidates-utils';

describe('normalizeNote', () => {
  it('lowercases and trims', () => {
    expect(normalizeNote({ note: '  NETFLIX  ' })).toBe('netflix');
  });

  it('strips reference numbers (6+ digits)', () => {
    expect(normalizeNote({ note: 'Payment 123456789' })).toBe('payment');
  });

  it('preserves short digit sequences (< 6 digits)', () => {
    expect(normalizeNote({ note: 'HBO Max 2024' })).toBe('hbo max 2024');
  });

  it('strips date patterns dd/mm/yyyy', () => {
    expect(normalizeNote({ note: 'Netflix 15/01/2025' })).toBe('netflix');
  });

  it('strips date patterns yyyy-mm-dd', () => {
    expect(normalizeNote({ note: 'Spotify 2025-01-15' })).toBe('spotify');
  });

  it('strips date patterns dd.mm.yyyy', () => {
    expect(normalizeNote({ note: 'Payment 01.12.2024' })).toBe('payment');
  });

  it('strips special characters', () => {
    expect(normalizeNote({ note: 'NETFLIX.COM/PAYMENT#123' })).toBe('netflixcompayment123');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeNote({ note: 'spotify   premium   plan' })).toBe('spotify premium plan');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeNote({ note: '' })).toBe('');
  });

  it('handles note with only special chars', () => {
    expect(normalizeNote({ note: '***---###' })).toBe('');
  });

  it('handles combined stripping (ref number + date + special chars)', () => {
    expect(normalizeNote({ note: 'PAYMENT 12345678 ON 15/01/2025 @STORE' })).toBe('payment on store');
  });
});

describe('isFuzzyNameMatch', () => {
  it('matches identical names', () => {
    expect(isFuzzyNameMatch({ a: 'Netflix', b: 'Netflix' })).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isFuzzyNameMatch({ a: 'NETFLIX', b: 'netflix' })).toBe(true);
  });

  it('matches when one contains the other', () => {
    expect(isFuzzyNameMatch({ a: 'Netflix', b: 'Netflix subscription' })).toBe(true);
  });

  it('matches when contained in reverse', () => {
    expect(isFuzzyNameMatch({ a: 'Netflix subscription', b: 'Netflix' })).toBe(true);
  });

  it('matches with different spacing/formatting', () => {
    expect(isFuzzyNameMatch({ a: 'Digital Ocean', b: 'DigitalOcean' })).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(isFuzzyNameMatch({ a: 'Netflix', b: 'Spotify' })).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(isFuzzyNameMatch({ a: '', b: 'Netflix' })).toBe(false);
    expect(isFuzzyNameMatch({ a: 'Netflix', b: '' })).toBe(false);
  });

  it('strips reference numbers before comparing', () => {
    expect(isFuzzyNameMatch({ a: 'Netflix 12345678', b: 'Netflix' })).toBe(true);
  });
});

describe('mapIntervalToFrequency', () => {
  it('maps <= 10 days to weekly', () => {
    expect(mapIntervalToFrequency({ medianDays: 7 })).toBe(SUBSCRIPTION_FREQUENCIES.weekly);
    expect(mapIntervalToFrequency({ medianDays: 10 })).toBe(SUBSCRIPTION_FREQUENCIES.weekly);
  });

  it('maps 11-21 days to biweekly', () => {
    expect(mapIntervalToFrequency({ medianDays: 11 })).toBe(SUBSCRIPTION_FREQUENCIES.biweekly);
    expect(mapIntervalToFrequency({ medianDays: 14 })).toBe(SUBSCRIPTION_FREQUENCIES.biweekly);
    expect(mapIntervalToFrequency({ medianDays: 21 })).toBe(SUBSCRIPTION_FREQUENCIES.biweekly);
  });

  it('maps 22-50 days to monthly', () => {
    expect(mapIntervalToFrequency({ medianDays: 22 })).toBe(SUBSCRIPTION_FREQUENCIES.monthly);
    expect(mapIntervalToFrequency({ medianDays: 30 })).toBe(SUBSCRIPTION_FREQUENCIES.monthly);
    expect(mapIntervalToFrequency({ medianDays: 50 })).toBe(SUBSCRIPTION_FREQUENCIES.monthly);
  });

  it('maps 51-120 days to quarterly', () => {
    expect(mapIntervalToFrequency({ medianDays: 51 })).toBe(SUBSCRIPTION_FREQUENCIES.quarterly);
    expect(mapIntervalToFrequency({ medianDays: 90 })).toBe(SUBSCRIPTION_FREQUENCIES.quarterly);
    expect(mapIntervalToFrequency({ medianDays: 120 })).toBe(SUBSCRIPTION_FREQUENCIES.quarterly);
  });

  it('maps 121-270 days to semiAnnual', () => {
    expect(mapIntervalToFrequency({ medianDays: 121 })).toBe(SUBSCRIPTION_FREQUENCIES.semiAnnual);
    expect(mapIntervalToFrequency({ medianDays: 180 })).toBe(SUBSCRIPTION_FREQUENCIES.semiAnnual);
    expect(mapIntervalToFrequency({ medianDays: 270 })).toBe(SUBSCRIPTION_FREQUENCIES.semiAnnual);
  });

  it('maps > 270 days to annual', () => {
    expect(mapIntervalToFrequency({ medianDays: 271 })).toBe(SUBSCRIPTION_FREQUENCIES.annual);
    expect(mapIntervalToFrequency({ medianDays: 365 })).toBe(SUBSCRIPTION_FREQUENCIES.annual);
  });
});

describe('splitByAmountBuckets', () => {
  function makeTx({ amount }: { amount: number }): TransactionForGrouping {
    return {
      id: Math.random(),
      amount,
      note: 'test',
      time: new Date(),
      accountId: 1,
      currencyCode: 'USD',
    };
  }

  it('groups identical amounts into one bucket', () => {
    const txs = [makeTx({ amount: -1000 }), makeTx({ amount: -1000 }), makeTx({ amount: -1000 })];
    const buckets = splitByAmountBuckets({ transactions: txs });

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toHaveLength(3);
  });

  it('separates amounts that differ by more than 10%', () => {
    const txs = [
      makeTx({ amount: -1000 }),
      makeTx({ amount: -1000 }),
      makeTx({ amount: -5000 }),
      makeTx({ amount: -5000 }),
    ];
    const buckets = splitByAmountBuckets({ transactions: txs });

    expect(buckets).toHaveLength(2);
  });

  it('groups amounts within 10% tolerance', () => {
    // 1000 and 1050 differ by 5% — should be same bucket
    const txs = [makeTx({ amount: -1000 }), makeTx({ amount: -1050 }), makeTx({ amount: -1020 })];
    const buckets = splitByAmountBuckets({ transactions: txs });

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(splitByAmountBuckets({ transactions: [] })).toHaveLength(0);
  });

  it('handles single transaction', () => {
    const buckets = splitByAmountBuckets({ transactions: [makeTx({ amount: -500 })] });

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toHaveLength(1);
  });

  it('respects custom tolerance', () => {
    // 1000 and 1150 differ by 15% — within 20% tolerance but outside default 10%
    const txs = [makeTx({ amount: -1000 }), makeTx({ amount: -1150 })];

    const defaultBuckets = splitByAmountBuckets({ transactions: txs });
    expect(defaultBuckets).toHaveLength(2);

    const looseBuckets = splitByAmountBuckets({ transactions: txs, tolerance: 0.2 });
    expect(looseBuckets).toHaveLength(1);
  });
});
