import { CategoryModel } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('editExcludedCategories', () => {
  let rootCategory: CategoryModel;
  let subCategory1: CategoryModel;
  let subCategory2: CategoryModel;

  beforeEach(async () => {
    rootCategory = await helpers.addCustomCategory({
      name: 'Root Category1',
      color: '#FF0000',
      raw: true,
    });
    subCategory1 = await helpers.addCustomCategory({
      name: 'Sub Category11',
      parentId: rootCategory.id,
      raw: true,
    });
    subCategory2 = await helpers.addCustomCategory({
      name: 'Sub Category22',
      parentId: rootCategory.id,
      raw: true,
    });
  });

  it('should add new categories to excluded list', async () => {
    const result = await helpers.editExcludedCategories({
      addIds: [subCategory1.id, subCategory2.id],
      removeIds: [],
      raw: true,
    });

    expect(result).toBeDefined();
    expect(result).toContain(subCategory1.id);
    expect(result).toContain(subCategory2.id);
  });

  it('should remove categories from excluded list', async () => {
    await helpers.editExcludedCategories({
      addIds: [subCategory1.id, subCategory2.id],
      removeIds: [],
      raw: true,
    });

    const result = await helpers.editExcludedCategories({
      addIds: [],
      removeIds: [subCategory1.id],
      raw: true,
    });

    expect(result).not.toContain(subCategory1.id);
    expect(result).toContain(subCategory2.id);
  });

  it('should handle adding and removing categories simultaneously', async () => {
    await helpers.editExcludedCategories({
      addIds: [subCategory1.id],
      removeIds: [],
      raw: true,
    });

    const result = await helpers.editExcludedCategories({
      addIds: [subCategory2.id],
      removeIds: [subCategory1.id],
      raw: true,
    });

    expect(result).not.toContain(subCategory1.id);
    expect(result).toContain(subCategory2.id);
  });

  it('should ignore non-existent categories when adding', async () => {
    const result = await helpers.editExcludedCategories({
      addIds: [subCategory1.id, 9999],
      removeIds: [],
      raw: true,
    });

    expect(result).toContain(subCategory1.id);
    expect(result).not.toContain(9999);
  });

  it('should ignore non-existent categories when removing', async () => {
    await helpers.editExcludedCategories({
      addIds: [subCategory1.id],
      removeIds: [],
      raw: true,
    });

    const result = await helpers.editExcludedCategories({
      addIds: [],
      removeIds: [9999],
      raw: true,
    });

    expect(result).toContain(subCategory1.id);
  });

  it('should handle duplicate categories when adding', async () => {
    const result = await helpers.editExcludedCategories({
      addIds: [subCategory1.id, subCategory1.id],
      removeIds: [],
      raw: true,
    });

    expect(result).toContain(subCategory1.id);
    expect(result.length).toBe(1);
  });

  it('should handle empty addIds and removeIds', async () => {
    await helpers.editExcludedCategories({
      addIds: [subCategory1.id],
      removeIds: [],
      raw: true,
    });

    const result = await helpers.editExcludedCategories({
      addIds: [],
      removeIds: [],
      raw: true,
    });

    expect(result).toContain(subCategory1.id);
  });
});
