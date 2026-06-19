import type { FormattedCategory } from '@/common/types';
import { describe, expect, it } from 'vitest';

import { buildCategoryMapById, flattenCategories } from './flatten-categories';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeCategory(id: string, name: string, subCategories: FormattedCategory[] = []): FormattedCategory {
  return {
    id,
    name,
    color: '#000000',
    icon: null,
    key: null,
    parentId: null,
    subCategories,
  } as unknown as FormattedCategory;
}

const grandchild1 = makeCategory('gc-1', 'Milk');
const grandchild2 = makeCategory('gc-2', 'Bread');
const child1 = makeCategory('c-1', 'Groceries', [grandchild1, grandchild2]);
const child2 = makeCategory('c-2', 'Transport');
const parent = makeCategory('p-1', 'Living', [child1, child2]);

const siblingParent1 = makeCategory('p-2', 'Entertainment');
const siblingParent2 = makeCategory('p-3', 'Utilities');

// ---------------------------------------------------------------------------
// flattenCategories
// ---------------------------------------------------------------------------

describe('flattenCategories', () => {
  it('returns empty array for empty input', () => {
    expect(flattenCategories({ categories: [] })).toEqual([]);
  });

  it('returns a flat list for a single category with no children', () => {
    expect(flattenCategories({ categories: [child2] })).toEqual([child2]);
  });

  it('flattens depth-first: parent before its children', () => {
    const result = flattenCategories({ categories: [parent] });
    const ids = result.map((c) => c.id);
    expect(ids).toEqual(['p-1', 'c-1', 'gc-1', 'gc-2', 'c-2']);
  });

  it('visits parents before children across sibling groups', () => {
    const result = flattenCategories({ categories: [parent, siblingParent1] });
    const ids = result.map((c) => c.id);
    // parent subtree exhausted before siblingParent1
    expect(ids).toEqual(['p-1', 'c-1', 'gc-1', 'gc-2', 'c-2', 'p-2']);
  });

  it('handles multiple root categories at the top level', () => {
    const result = flattenCategories({ categories: [siblingParent1, siblingParent2] });
    const ids = result.map((c) => c.id);
    expect(ids).toEqual(['p-2', 'p-3']);
  });

  it('includes every node exactly once', () => {
    const result = flattenCategories({ categories: [parent, siblingParent1, siblingParent2] });
    const ids = result.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('total count equals number of nodes in the tree', () => {
    // parent subtree: p-1, c-1, gc-1, gc-2, c-2 → 5 nodes
    const result = flattenCategories({ categories: [parent] });
    expect(result).toHaveLength(5);
  });

  it('preserves the original category objects (identity)', () => {
    const result = flattenCategories({ categories: [child1] });
    expect(result[0]).toBe(child1);
    expect(result[1]).toBe(grandchild1);
    expect(result[2]).toBe(grandchild2);
  });
});

// ---------------------------------------------------------------------------
// buildCategoryMapById
// ---------------------------------------------------------------------------

describe('buildCategoryMapById', () => {
  it('returns an empty map for empty input', () => {
    const result = buildCategoryMapById({ categories: [] });
    expect(result.size).toBe(0);
  });

  it('maps a single root category to its id', () => {
    const result = buildCategoryMapById({ categories: [siblingParent1] });
    expect(result.get('p-2')).toEqual(siblingParent1);
  });

  it('maps all nodes across all depths', () => {
    const result = buildCategoryMapById({ categories: [parent] });
    expect(result.get('p-1')).toEqual(parent);
    expect(result.get('c-1')).toEqual(child1);
    expect(result.get('gc-1')).toEqual(grandchild1);
    expect(result.get('gc-2')).toEqual(grandchild2);
    expect(result.get('c-2')).toEqual(child2);
  });

  it('map size equals total number of nodes', () => {
    const result = buildCategoryMapById({ categories: [parent] });
    expect(result.size).toBe(5);
  });

  it('maps nodes from multiple root categories', () => {
    const result = buildCategoryMapById({ categories: [parent, siblingParent1, siblingParent2] });
    expect(result.get('p-1')).toEqual(parent);
    expect(result.get('p-2')).toEqual(siblingParent1);
    expect(result.get('p-3')).toEqual(siblingParent2);
    expect(result.size).toBe(7);
  });

  it('returns undefined for a non-existent id', () => {
    const result = buildCategoryMapById({ categories: [parent] });
    expect(result.get('does-not-exist')).toBeUndefined();
  });
});
