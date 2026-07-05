import type { RecordId } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { expandCategoryIdsWithDescendants, getRootCategoryId } from './category-hierarchy';
import { AccessibleCategoryInfo } from './get-accessible-category-map.service';

const makeCat = (id: string, parentId: string | null): AccessibleCategoryInfo => ({
  id: id as RecordId,
  name: id,
  color: '#000000',
  parentId: parentId as RecordId | null,
});

// root -> child -> grandchild, a separate `other` root, plus a `leaf -> mid -> ghost` chain
// whose deepest parent (`ghost`) is intentionally absent from the map.
const categories: AccessibleCategoryInfo[] = [
  makeCat('root', null),
  makeCat('child', 'root'),
  makeCat('grandchild', 'child'),
  makeCat('other', null),
  makeCat('leaf', 'mid'),
  makeCat('mid', 'ghost'),
];

const byId = new Map<string, AccessibleCategoryInfo>(categories.map((cat) => [cat.id, cat]));

describe('getRootCategoryId', () => {
  it('walks a leaf up to its root', () => {
    expect(getRootCategoryId({ categoryId: 'grandchild', byId })).toBe('root');
    expect(getRootCategoryId({ categoryId: 'child', byId })).toBe('root');
  });

  it('returns the category itself when it is already a root', () => {
    expect(getRootCategoryId({ categoryId: 'root', byId })).toBe('root');
  });

  it('stops at the deepest resolvable ancestor when a parent link dangles', () => {
    // `mid.parentId` points at `ghost`, which is not in the map, so the walk stops at `mid`.
    expect(getRootCategoryId({ categoryId: 'leaf', byId })).toBe('mid');
  });

  it('returns the id unchanged when the category is not in the map', () => {
    expect(getRootCategoryId({ categoryId: 'unknown', byId })).toBe('unknown');
  });
});

describe('expandCategoryIdsWithDescendants', () => {
  it('expands a parent id to include its children and grandchildren', () => {
    const result = expandCategoryIdsWithDescendants({ categoryIds: ['root'], categories, byId });
    expect(result.toSorted()).toEqual(['child', 'grandchild', 'root']);
  });

  it('expands a leaf id to just itself', () => {
    const result = expandCategoryIdsWithDescendants({ categoryIds: ['grandchild'], categories, byId });
    expect(result).toEqual(['grandchild']);
  });
});
