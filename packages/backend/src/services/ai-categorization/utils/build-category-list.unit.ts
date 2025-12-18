import { CATEGORY_TYPES, CategoryModel } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { buildCategoryList } from './build-category-list';

describe('buildCategoryList', () => {
  const baseCategory = {
    color: '#FF0000',
    imageUrl: null,
    type: CATEGORY_TYPES.custom,
    userId: 1,
  };

  it('transforms CategoryModel to CategoryForCategorization', () => {
    const categories: CategoryModel[] = [
      {
        ...baseCategory,
        id: 1,
        name: 'Food',
        parentId: null,
      },
    ];

    const result = buildCategoryList(categories);

    expect(result).toEqual([
      {
        id: 1,
        name: 'Food',
        parentId: null,
      },
    ]);
  });

  it('strips color and imageUrl fields', () => {
    const categories: CategoryModel[] = [
      {
        ...baseCategory,
        id: 1,
        name: 'Entertainment',
        parentId: null,
        color: '#00FF00',
        imageUrl: 'https://example.com/icon.png',
      },
    ];

    const result = buildCategoryList(categories);

    expect(result[0]).not.toHaveProperty('color');
    expect(result[0]).not.toHaveProperty('imageUrl');
  });

  it('preserves parentId relationships', () => {
    const categories: CategoryModel[] = [
      { ...baseCategory, id: 1, name: 'Food', parentId: null },
      { ...baseCategory, id: 2, name: 'Restaurants', parentId: 1 },
      { ...baseCategory, id: 3, name: 'Groceries', parentId: 1 },
    ];

    const result = buildCategoryList(categories);

    expect(result).toEqual([
      { id: 1, name: 'Food', parentId: null },
      { id: 2, name: 'Restaurants', parentId: 1 },
      { id: 3, name: 'Groceries', parentId: 1 },
    ]);
  });

  it('returns empty array for empty input', () => {
    const result = buildCategoryList([]);

    expect(result).toEqual([]);
  });

  it('handles multiple root categories', () => {
    const categories: CategoryModel[] = [
      { ...baseCategory, id: 1, name: 'Food', parentId: null, color: '#FF0000' },
      { ...baseCategory, id: 2, name: 'Transport', parentId: null, color: '#00FF00' },
      { ...baseCategory, id: 3, name: 'Entertainment', parentId: null, color: '#0000FF' },
    ];

    const result = buildCategoryList(categories);

    expect(result).toHaveLength(3);
    expect(result.every((c) => c.parentId === null)).toBe(true);
  });
});
