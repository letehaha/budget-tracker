import type { FormattedCategory } from '@/common/types';
import { describe, expect, it } from 'vitest';

import { buildDescendantMap, filterCategoryTree, toggleExclusion } from './helpers';

const category = ({
  id,
  name,
  subCategories = [],
}: {
  id: string;
  name: string;
  subCategories?: FormattedCategory[];
}): FormattedCategory => ({ id, name, subCategories }) as unknown as FormattedCategory;

const TREE: FormattedCategory[] = [
  category({
    id: 'food',
    name: 'Food & Drinks',
    subCategories: [
      category({
        id: 'fast',
        name: 'Fast-food',
        subCategories: [category({ id: 'sushi', name: 'Sushi' }), category({ id: 'burgers', name: 'Burgers' })],
      }),
      category({ id: 'groceries', name: 'Groceries' }),
    ],
  }),
  category({ id: 'sport', name: 'Sport' }),
];

describe('buildDescendantMap', () => {
  it('collects descendants at every depth', () => {
    const map = buildDescendantMap({ categories: TREE });

    expect(map.food!.toSorted()).toEqual(['burgers', 'fast', 'groceries', 'sushi']);
    expect(map.fast!.toSorted()).toEqual(['burgers', 'sushi']);
  });

  it('gives leaves an empty list rather than leaving them out', () => {
    const map = buildDescendantMap({ categories: TREE });

    expect(map.sushi).toEqual([]);
    expect(map.sport).toEqual([]);
  });
});

describe('filterCategoryTree', () => {
  it('returns the whole tree for an empty query', () => {
    const result = filterCategoryTree({ categories: TREE, query: '  ' });

    expect(result).toHaveLength(2);
    expect(result[0]!.children).toHaveLength(2);
  });

  it('keeps the ancestors of a deep match so it stays reachable', () => {
    const result = filterCategoryTree({ categories: TREE, query: 'sushi' });

    expect(result.map((node) => node.category.id)).toEqual(['food']);
    expect(result[0]!.children.map((node) => node.category.id)).toEqual(['fast']);
    expect(result[0]!.children[0]!.children.map((node) => node.category.id)).toEqual(['sushi']);
  });

  it('matches case-insensitively and drops non-matching branches', () => {
    const result = filterCategoryTree({ categories: TREE, query: 'SPORT' });

    expect(result.map((node) => node.category.id)).toEqual(['sport']);
  });

  it('returns nothing when no category matches', () => {
    expect(filterCategoryTree({ categories: TREE, query: 'zzz' })).toEqual([]);
  });

  it('keeps the whole subtree when a parent matches but none of its children do', () => {
    // "Drinks" only matches the parent name ("Food & Drinks") -- none of its children
    // ("Fast-food", "Groceries", "Sushi", "Burgers") contain "drinks".
    const result = filterCategoryTree({ categories: TREE, query: 'Drinks' });

    expect(result.map((node) => node.category.id)).toEqual(['food']);
    expect(result[0]!.children.map((node) => node.category.id)).toEqual(['fast', 'groceries']);
    expect(result[0]!.children[0]!.children.map((node) => node.category.id)).toEqual(['sushi', 'burgers']);
  });
});

describe('toggleExclusion', () => {
  const descendantsById = buildDescendantMap({ categories: TREE });

  it('adds a category together with its whole subtree', () => {
    const result = toggleExclusion({ excludedIds: [], categoryId: 'fast', descendantsById });

    expect(result.toSorted()).toEqual(['burgers', 'fast', 'sushi']);
  });

  it('removes the whole subtree again', () => {
    const excluded = toggleExclusion({ excludedIds: [], categoryId: 'fast', descendantsById });
    const result = toggleExclusion({ excludedIds: excluded, categoryId: 'fast', descendantsById });

    expect(result).toEqual([]);
  });

  it('leaves unrelated exclusions in place', () => {
    const result = toggleExclusion({ excludedIds: ['sport'], categoryId: 'groceries', descendantsById });

    expect(result.toSorted()).toEqual(['groceries', 'sport']);
  });

  it('does not duplicate a subtree that is already partly excluded', () => {
    const result = toggleExclusion({ excludedIds: ['sushi'], categoryId: 'fast', descendantsById });

    expect(result.toSorted()).toEqual(['burgers', 'fast', 'sushi']);
  });
});
