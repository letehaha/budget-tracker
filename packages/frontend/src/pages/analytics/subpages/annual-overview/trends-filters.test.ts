import {
  type TrendsFilters,
  countActiveFilters,
  emptyTrendsFilters,
  hideCategory,
  parseTrendsFilters,
  showCategory,
  toStatsFilterParams,
} from './trends-filters';

const makeFilters = (overrides: Partial<TrendsFilters> = {}): TrendsFilters => ({
  ...emptyTrendsFilters(),
  ...overrides,
});

describe('toStatsFilterParams', () => {
  it('returns an empty object when nothing is selected', () => {
    expect(toStatsFilterParams({ filters: makeFilters() })).toEqual({});
  });

  it('maps categories to categoryIds in include mode', () => {
    expect(toStatsFilterParams({ filters: makeFilters({ categories: { mode: 'include', ids: ['1', '2'] } }) })).toEqual(
      { categoryIds: ['1', '2'] },
    );
  });

  it('maps categories to excludedCategoryIds in exclude mode', () => {
    expect(toStatsFilterParams({ filters: makeFilters({ categories: { mode: 'exclude', ids: ['1'] } }) })).toEqual({
      excludedCategoryIds: ['1'],
    });
  });

  it('maps payees to excludedPayeeIds in exclude mode', () => {
    expect(toStatsFilterParams({ filters: makeFilters({ payees: { mode: 'exclude', ids: ['p1', 'p2'] } }) })).toEqual({
      excludedPayeeIds: ['p1', 'p2'],
    });
  });

  it('maps tags to excludedTagIds in exclude mode', () => {
    expect(toStatsFilterParams({ filters: makeFilters({ tags: { mode: 'exclude', ids: ['t1'] } }) })).toEqual({
      excludedTagIds: ['t1'],
    });
  });

  it('omits empty groups and passes through the rest', () => {
    expect(
      toStatsFilterParams({
        filters: makeFilters({ accountIds: ['a'], tags: { mode: 'include', ids: ['t1', 't2'] } }),
      }),
    ).toEqual({ accountIds: ['a'], tagIds: ['t1', 't2'] });
  });

  it('omits a group whose mode is exclude but has no ids', () => {
    expect(toStatsFilterParams({ filters: makeFilters({ payees: { mode: 'exclude', ids: [] } }) })).toEqual({});
  });
});

describe('countActiveFilters', () => {
  it('counts zero for empty filters', () => {
    expect(countActiveFilters({ filters: makeFilters() })).toBe(0);
  });

  it('counts a group once regardless of how many ids it holds', () => {
    expect(
      countActiveFilters({ filters: makeFilters({ categories: { mode: 'include', ids: ['1', '2', '3'] } }) }),
    ).toBe(1);
  });

  it('counts each non-empty group once', () => {
    expect(
      countActiveFilters({
        filters: makeFilters({
          categories: { mode: 'include', ids: ['1'] },
          payees: { mode: 'exclude', ids: ['p'] },
          tags: { mode: 'include', ids: ['t'] },
          accountIds: ['a'],
        }),
      }),
    ).toBe(4);
  });
});

describe('hideCategory', () => {
  it('flips an empty include list to excluding that category', () => {
    expect(hideCategory({ filters: makeFilters(), categoryId: '1' })).toEqual(
      makeFilters({ categories: { mode: 'exclude', ids: ['1'] } }),
    );
  });

  it('removes the category from a non-empty include list', () => {
    expect(
      hideCategory({ filters: makeFilters({ categories: { mode: 'include', ids: ['1', '2'] } }), categoryId: '1' }),
    ).toEqual(makeFilters({ categories: { mode: 'include', ids: ['2'] } }));
  });

  it('flips to exclude when the last included category is hidden', () => {
    expect(
      hideCategory({ filters: makeFilters({ categories: { mode: 'include', ids: ['1'] } }), categoryId: '1' }),
    ).toEqual(makeFilters({ categories: { mode: 'exclude', ids: ['1'] } }));
  });

  it('appends to the exclude list', () => {
    expect(
      hideCategory({ filters: makeFilters({ categories: { mode: 'exclude', ids: ['1'] } }), categoryId: '2' }),
    ).toEqual(makeFilters({ categories: { mode: 'exclude', ids: ['1', '2'] } }));
  });

  it('is a no-op when the category is already excluded', () => {
    const filters = makeFilters({ categories: { mode: 'exclude', ids: ['1'] } });
    expect(hideCategory({ filters, categoryId: '1' })).toBe(filters);
  });

  it('leaves the other groups untouched', () => {
    const filters = makeFilters({ payees: { mode: 'exclude', ids: ['p'] }, accountIds: ['a'] });
    const next = hideCategory({ filters, categoryId: '1' });
    expect(next.payees).toEqual({ mode: 'exclude', ids: ['p'] });
    expect(next.accountIds).toEqual(['a']);
  });

  it('does not mutate the input', () => {
    const filters = makeFilters({ categories: { mode: 'include', ids: ['1', '2'] } });
    hideCategory({ filters, categoryId: '1' });
    expect(filters.categories.ids).toEqual(['1', '2']);
  });
});

describe('showCategory', () => {
  it('removes the category from the exclude list', () => {
    expect(
      showCategory({ filters: makeFilters({ categories: { mode: 'exclude', ids: ['1', '2'] } }), categoryId: '1' }),
    ).toEqual(makeFilters({ categories: { mode: 'exclude', ids: ['2'] } }));
  });

  it('is a no-op in include mode', () => {
    const filters = makeFilters({ categories: { mode: 'include', ids: ['1'] } });
    expect(showCategory({ filters, categoryId: '1' })).toBe(filters);
  });
});

describe('parseTrendsFilters', () => {
  it('round-trips the current shape', () => {
    const filters = makeFilters({ tags: { mode: 'exclude', ids: ['t1'] }, accountIds: ['a'] });
    expect(parseTrendsFilters({ raw: JSON.stringify(filters) })).toEqual(filters);
  });

  it('falls back to empty filters for a stored value of the old flat shape', () => {
    const legacy = JSON.stringify({
      categoryMode: 'exclude',
      categoryIds: ['1'],
      accountIds: [],
      payeeIds: [],
      tagIds: [],
    });
    expect(parseTrendsFilters({ raw: legacy })).toEqual(emptyTrendsFilters());
  });

  it('falls back to empty filters when a group has an unknown mode', () => {
    const raw = JSON.stringify({ ...emptyTrendsFilters(), tags: { mode: 'only', ids: ['t1'] } });
    expect(parseTrendsFilters({ raw })).toEqual(emptyTrendsFilters());
  });

  it('falls back to empty filters when a group holds non-string ids', () => {
    const raw = JSON.stringify({ ...emptyTrendsFilters(), payees: { mode: 'include', ids: [1, 2] } });
    expect(parseTrendsFilters({ raw })).toEqual(emptyTrendsFilters());
  });

  it('falls back to empty filters when accountIds holds non-string values', () => {
    const raw = JSON.stringify({ ...emptyTrendsFilters(), accountIds: [1, 2] });
    expect(parseTrendsFilters({ raw })).toEqual(emptyTrendsFilters());
  });

  it('falls back to empty filters for unparsable input', () => {
    expect(parseTrendsFilters({ raw: 'not json' })).toEqual(emptyTrendsFilters());
  });
});

describe('emptyTrendsFilters', () => {
  it('returns a fresh object each call so callers cannot alias shared state', () => {
    const first = emptyTrendsFilters();
    const second = emptyTrendsFilters();
    first.categories.ids.push('1');
    expect(second.categories.ids).toEqual([]);
  });
});
