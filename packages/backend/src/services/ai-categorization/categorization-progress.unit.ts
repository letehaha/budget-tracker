import { describe, expect, it } from '@jest/globals';

import { buildFailedRunStatus, parseProgressCounters } from './categorization-progress';

describe('parseProgressCounters', () => {
  it('reads counters from the worker-written blob', () => {
    expect(parseProgressCounters({ progress: { processedCount: 7, totalCount: 10, failedCount: 2 } })).toEqual({
      processedCount: 7,
      failedCount: 2,
    });
  });

  it.each([
    ['BullMQ default numeric progress', 0],
    ['null', null],
    ['a partial blob with wrong value types', { processedCount: 'lots', failedCount: undefined }],
  ])('falls back to zeros for %s', (_label, progress) => {
    expect(parseProgressCounters({ progress })).toEqual({ processedCount: 0, failedCount: 0 });
  });
});

describe('buildFailedRunStatus', () => {
  it('counts everything that never ran as failed on top of the recorded failures', () => {
    expect(buildFailedRunStatus({ progress: { processedCount: 2, failedCount: 1 }, totalCount: 5 })).toEqual({
      status: 'failed',
      processedCount: 2,
      totalCount: 5,
      failedCount: 4,
    });
  });

  it('reports everything failed when no progress blob was ever written', () => {
    expect(buildFailedRunStatus({ progress: 0, totalCount: 5 })).toEqual({
      status: 'failed',
      processedCount: 0,
      totalCount: 5,
      failedCount: 5,
    });
  });

  it('never lets an overcounted processedCount turn the remainder negative', () => {
    expect(buildFailedRunStatus({ progress: { processedCount: 9, failedCount: 1 }, totalCount: 5 })).toEqual({
      status: 'failed',
      processedCount: 9,
      totalCount: 5,
      failedCount: 1,
    });
  });

  it('carries the failure cause through when the worker knows it', () => {
    expect(
      buildFailedRunStatus({ progress: 0, totalCount: 5, errorMessage: 'job stalled more than allowable limit' }),
    ).toEqual({
      status: 'failed',
      processedCount: 0,
      totalCount: 5,
      failedCount: 5,
      errorMessage: 'job stalled more than allowable limit',
    });
  });

  it('omits errorMessage entirely when there is no cause to report', () => {
    expect(buildFailedRunStatus({ progress: 0, totalCount: 1 })).not.toHaveProperty('errorMessage');
  });
});
