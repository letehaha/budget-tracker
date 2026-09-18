import { describe, expect, it } from 'vitest';

import { fitWithinMaxEdge } from './compress-image.worker';

describe('fitWithinMaxEdge', () => {
  it('leaves images already within the limit untouched', () => {
    expect(fitWithinMaxEdge({ width: 800, height: 600, maxEdge: 2000 })).toEqual({ width: 800, height: 600 });
    expect(fitWithinMaxEdge({ width: 2000, height: 2000, maxEdge: 2000 })).toEqual({ width: 2000, height: 2000 });
  });

  it('scales the long edge down to the limit and keeps the aspect ratio', () => {
    expect(fitWithinMaxEdge({ width: 4000, height: 3000, maxEdge: 2000 })).toEqual({ width: 2000, height: 1500 });
    expect(fitWithinMaxEdge({ width: 3000, height: 6000, maxEdge: 2000 })).toEqual({ width: 1000, height: 2000 });
  });

  it('never returns a zero dimension for extreme aspect ratios', () => {
    expect(fitWithinMaxEdge({ width: 10000, height: 3, maxEdge: 2000 })).toEqual({ width: 2000, height: 1 });
  });
});
