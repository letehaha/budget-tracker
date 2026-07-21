import { describe, expect, it } from '@jest/globals';

import { selectLatestPreWindowAnchors } from './security-price-anchors';

// The rows arrive already sorted securityId ASC, date DESC (the caller's query
// order), so the first row seen per security is its most recent pre-window close.
const row = (securityId: string, date: string) => ({ securityId, date });

describe('selectLatestPreWindowAnchors', () => {
  it('keeps only the latest row per security and drops the older duplicates', () => {
    const anchors = selectLatestPreWindowAnchors([
      row('sec-1', '2024-04-30'),
      row('sec-1', '2024-04-20'),
      row('sec-1', '2024-01-01'),
      row('sec-2', '2024-04-28'),
      row('sec-2', '2024-03-15'),
    ]);

    expect(anchors).toEqual([row('sec-1', '2024-04-30'), row('sec-2', '2024-04-28')]);
  });

  it('returns one anchor per security when each has a single row', () => {
    const anchors = selectLatestPreWindowAnchors([row('sec-1', '2024-04-30'), row('sec-2', '2024-04-28')]);

    expect(anchors).toEqual([row('sec-1', '2024-04-30'), row('sec-2', '2024-04-28')]);
  });

  it('returns nothing for no rows', () => {
    expect(selectLatestPreWindowAnchors([])).toEqual([]);
  });
});
