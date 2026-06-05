import { describe, expect, it } from '@jest/globals';
import type Payees from '@models/payees.model';

import { FUZZY_MATCH_THRESHOLD, buildFuzzyIndex, buildHaystack, fuzzyFindBestMatch } from './fuzzy-matcher';

// Minimal stand-in for the Sequelize model — `buildHaystack` only touches
// `id`, `name`, and `aliases[].rawName`. Cast through `unknown` so tests don't
// pull the full ORM machinery.
function makePayee({ id, name, aliases = [] }: { id: string; name: string; aliases?: { rawName: string }[] }): Payees {
  return { id, name, aliases } as unknown as Payees;
}

describe('buildHaystack', () => {
  it('returns one entry per canonical Payee name', () => {
    const haystack = buildHaystack({
      payees: [makePayee({ id: 'p1', name: 'Amazon' }), makePayee({ id: 'p2', name: 'Netflix' })],
    });
    expect(haystack).toHaveLength(2);
    expect(haystack).toEqual(
      expect.arrayContaining([
        { payeeId: 'p1', text: 'Amazon' },
        { payeeId: 'p2', text: 'Netflix' },
      ]),
    );
  });

  it('emits an entry per alias, all pointing back to the parent payee id', () => {
    const haystack = buildHaystack({
      payees: [
        makePayee({
          id: 'p1',
          name: 'Amazon',
          aliases: [{ rawName: 'AMZN MKTP' }, { rawName: 'Amazon Marketplace' }],
        }),
      ],
    });
    expect(haystack).toHaveLength(3);
    expect(haystack.every((e) => e.payeeId === 'p1')).toBe(true);
    expect(haystack.map((e) => e.text)).toEqual(expect.arrayContaining(['Amazon', 'AMZN MKTP', 'Amazon Marketplace']));
  });

  it('returns an empty array for no payees', () => {
    expect(buildHaystack({ payees: [] })).toEqual([]);
  });

  it('skips aliases when the payee has none', () => {
    // Mirrors the runtime shape when the include returned `undefined` aliases.
    const payee = { id: 'p1', name: 'Solo' } as unknown as Payees;
    expect(buildHaystack({ payees: [payee] })).toEqual([{ payeeId: 'p1', text: 'Solo' }]);
  });
});

describe('buildFuzzyIndex / fuzzyFindBestMatch', () => {
  const haystack = buildHaystack({
    payees: [
      makePayee({ id: 'p1', name: 'Amazon', aliases: [{ rawName: 'AMZN' }] }),
      makePayee({ id: 'p2', name: 'Starbucks Coffee' }),
      makePayee({ id: 'p3', name: 'Glovo' }),
    ],
  });

  it('returns a match for an exact canonical name', () => {
    const match = fuzzyFindBestMatch({ haystack, query: 'Amazon' });
    expect(match?.payeeId).toBe('p1');
    expect(match?.score).toBeLessThanOrEqual(FUZZY_MATCH_THRESHOLD);
  });

  it('matches a query embedded with punctuation/case variation', () => {
    // Provider strings frequently arrive with punctuation and case noise.
    // `normalizePayeeName` strips that before the lookup — the matcher then
    // sees a clean "amazon com" against the haystack entry "amazon" and
    // links them via Fuse's fuzzy threshold.
    const match = fuzzyFindBestMatch({ haystack, query: 'AMAZON.COM' });
    expect(match?.payeeId).toBe('p1');
  });

  it('matches an alias as if it were the canonical name', () => {
    const match = fuzzyFindBestMatch({ haystack, query: 'AMZN' });
    expect(match?.payeeId).toBe('p1');
  });

  it('returns null when nothing reasonable matches', () => {
    const match = fuzzyFindBestMatch({ haystack, query: 'wholly unrelated merchant string' });
    expect(match).toBeNull();
  });

  it('returns null for queries shorter than the minimum match char length', () => {
    // `minMatchCharLength = 3`; `normalizePayeeName` lowercases then drops
    // punctuation, so "AB" normalizes to "ab" which is still under the floor.
    expect(fuzzyFindBestMatch({ haystack, query: 'AB' })).toBeNull();
  });

  it('returns null for empty/whitespace queries', () => {
    expect(fuzzyFindBestMatch({ haystack, query: '' })).toBeNull();
    expect(fuzzyFindBestMatch({ haystack, query: '   ' })).toBeNull();
  });

  it('respects the threshold — a high-score (poor) hit is rejected', () => {
    // A single-letter overlap should not link "Glovo" to "Netflix".
    const match = fuzzyFindBestMatch({ haystack, query: 'Netflix' });
    expect(match).toBeNull();
  });

  it('reuses a built index across multiple queries (batch path)', () => {
    const index = buildFuzzyIndex({ haystack });
    const first = index.search({ query: 'Amazon.com' });
    const second = index.search({ query: 'Starbucks' });
    expect(first?.payeeId).toBe('p1');
    expect(second?.payeeId).toBe('p2');
  });
});
