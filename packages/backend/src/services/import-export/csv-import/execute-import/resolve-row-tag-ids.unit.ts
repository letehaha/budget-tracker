import { describe, expect, it } from '@jest/globals';

import { resolveRowTagIds } from './resolve-row-tag-ids';

describe('resolveRowTagIds', () => {
  it("maps a row's tag names to their resolved ids", () => {
    const tagNameToId = new Map([
      ['food', 'id-food'],
      ['travel', 'id-travel'],
    ]);

    expect(resolveRowTagIds({ tagNames: ['food', 'travel'], tagNameToId })).toEqual(['id-food', 'id-travel']);
  });

  it('drops names absent from the map (skipped or unmapped source values)', () => {
    const tagNameToId = new Map([['food', 'id-food']]);

    expect(resolveRowTagIds({ tagNames: ['food', 'junk'], tagNameToId })).toEqual(['id-food']);
  });

  it('dedupes when two source names resolve to the same id (many-to-one)', () => {
    const tagNameToId = new Map([
      ['food', 'id-shared'],
      ['groceries', 'id-shared'],
    ]);

    expect(resolveRowTagIds({ tagNames: ['food', 'groceries'], tagNameToId })).toEqual(['id-shared']);
  });

  it('dedupes a repeated source name within the same row', () => {
    const tagNameToId = new Map([['food', 'id-food']]);

    expect(resolveRowTagIds({ tagNames: ['food', 'food'], tagNameToId })).toEqual(['id-food']);
  });

  it('returns an empty array when the row has no tag names', () => {
    const tagNameToId = new Map([['food', 'id-food']]);

    expect(resolveRowTagIds({ tagNames: undefined, tagNameToId })).toEqual([]);
    expect(resolveRowTagIds({ tagNames: [], tagNameToId })).toEqual([]);
  });
});
