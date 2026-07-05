import { describe, expect, it } from '@jest/globals';

import { PeriodBucket, findBucketIndex } from './index';

describe('findBucketIndex', () => {
  const buckets: PeriodBucket[] = [
    { periodStart: new Date('2025-01-01T00:00:00Z'), periodEnd: new Date('2025-01-31T23:59:59Z') },
    { periodStart: new Date('2025-02-01T00:00:00Z'), periodEnd: new Date('2025-02-28T23:59:59Z') },
    { periodStart: new Date('2025-03-01T00:00:00Z'), periodEnd: new Date('2025-03-31T23:59:59Z') },
  ];

  it('locates the bucket a time falls inside', () => {
    expect(findBucketIndex({ transactionTime: new Date('2025-01-15T12:00:00Z'), buckets })).toBe(0);
    expect(findBucketIndex({ transactionTime: new Date('2025-02-15T12:00:00Z'), buckets })).toBe(1);
    expect(findBucketIndex({ transactionTime: new Date('2025-03-20T12:00:00Z'), buckets })).toBe(2);
  });

  it('treats both bucket edges as inclusive', () => {
    // Exactly on a periodStart.
    expect(findBucketIndex({ transactionTime: new Date('2025-02-01T00:00:00Z'), buckets })).toBe(1);
    // Exactly on a periodEnd.
    expect(findBucketIndex({ transactionTime: new Date('2025-02-28T23:59:59Z'), buckets })).toBe(1);
  });

  it('returns -1 when the time is outside every bucket', () => {
    expect(findBucketIndex({ transactionTime: new Date('2024-12-31T23:59:59Z'), buckets })).toBe(-1);
    expect(findBucketIndex({ transactionTime: new Date('2025-04-01T00:00:00Z'), buckets })).toBe(-1);
  });
});
