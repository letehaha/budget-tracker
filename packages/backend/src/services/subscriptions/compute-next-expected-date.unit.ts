import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

import { computeNextExpectedDate } from './subscription-date.utils';

const FROZEN_NOW = new Date('2025-06-15T12:00:00Z');

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FROZEN_NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

describe('computeNextExpectedDate', () => {
  describe('without transactions', () => {
    it('returns the next weekly date from startDate', () => {
      const result = computeNextExpectedDate({
        startDate: '2025-06-14T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.weekly,
      });
      expect(result).toBe('2025-06-21');
    });

    it('returns the next biweekly date from startDate', () => {
      const result = computeNextExpectedDate({
        startDate: '2025-06-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.biweekly,
      });
      expect(result).toBe('2025-06-29');
    });

    it('returns the next monthly date from startDate', () => {
      const result = computeNextExpectedDate({
        startDate: '2025-05-20T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      });
      expect(result).toBe('2025-06-20');
    });

    it('returns the next quarterly date from startDate', () => {
      const result = computeNextExpectedDate({
        startDate: '2025-01-10T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.quarterly,
      });
      expect(result).toBe('2025-07-10');
    });

    it('returns the next semi-annual date from startDate', () => {
      const result = computeNextExpectedDate({
        startDate: '2024-12-20T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.semiAnnual,
      });
      expect(result).toBe('2025-06-20');
    });

    it('returns the next annual date from startDate', () => {
      const result = computeNextExpectedDate({
        startDate: '2024-07-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.annual,
      });
      expect(result).toBe('2025-07-01');
    });

    it('advances past multiple periods when startDate is far in the past', () => {
      const result = computeNextExpectedDate({
        startDate: '2023-01-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
      });
      expect(result).toBe('2025-07-01');
    });
  });

  describe('with transactions', () => {
    it('advances from the latest transaction date instead of startDate', () => {
      const result = computeNextExpectedDate({
        startDate: '2024-01-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        transactions: [{ time: '2025-05-10T00:00:00Z' }, { time: '2025-06-10T00:00:00Z' }],
      });
      expect(result).toBe('2025-07-10');
    });

    it('uses the latest transaction when they are out of order', () => {
      const result = computeNextExpectedDate({
        startDate: '2024-01-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        transactions: [
          { time: '2025-06-10T00:00:00Z' },
          { time: '2025-04-10T00:00:00Z' },
          { time: '2025-05-10T00:00:00Z' },
        ],
      });
      expect(result).toBe('2025-07-10');
    });

    it('ignores transactions with null/undefined time', () => {
      const result = computeNextExpectedDate({
        startDate: '2024-01-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        transactions: [{ time: undefined }, { time: '2025-06-01T00:00:00Z' }],
      });
      expect(result).toBe('2025-07-01');
    });

    it('falls back to startDate when all transaction times are null', () => {
      const result = computeNextExpectedDate({
        startDate: '2025-06-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        transactions: [{ time: undefined }, { time: undefined }],
      });
      expect(result).toBe('2025-07-01');
    });

    it('falls back to startDate when transactions array is empty', () => {
      const result = computeNextExpectedDate({
        startDate: '2025-06-01T00:00:00Z',
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        transactions: [],
      });
      expect(result).toBe('2025-07-01');
    });
  });
});
