import { CATEGORY_TYPES, CategoryModel } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

const mockedCategory = {
  name: 'test-category',
  color: '#FF0000',
  icon: 'food-20-filled',
};
const updatedCategory = {
  name: 'updated-test-category',
  color: '#00FF00',
  icon: 'shopping-bag-20-filled',
};

describe('Edit custom categories', () => {
  let testCategory: CategoryModel;

  beforeEach(async () => {
    testCategory = await helpers.addCustomCategory({
      name: mockedCategory.name,
      color: mockedCategory.color,
      raw: true,
    });
  });

  it('should successfully edit a category with all fields', async () => {
    const [category] = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      ...updatedCategory,
      raw: true,
    });

    expect(category!.name).toBe(updatedCategory.name);
    expect(category!.color).toBe(updatedCategory.color);
    expect(category!.icon).toBe(updatedCategory.icon);
  });

  it('should successfully edit a sub-category with all fields', async () => {
    const parent = (await helpers.getCategoriesList())[0];

    const subCategory = await helpers.addCustomCategory({
      parentId: parent!.id,
      name: mockedCategory.name,
      color: mockedCategory.color,
      raw: true,
    });
    const [category] = await helpers.editCustomCategory({
      categoryId: subCategory.id,
      ...updatedCategory,
      raw: true,
    });

    expect(category!.name).toBe(updatedCategory.name);
    expect(category!.color).toBe(updatedCategory.color);
    expect(category!.icon).toBe(updatedCategory.icon);
  });

  it('should successfully edit a category with only name', async () => {
    const [category] = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      name: updatedCategory.name,
      raw: true,
    });

    expect(category!.name).toBe(updatedCategory.name);
    expect(category!.color).toBe(mockedCategory.color);
  });

  it('should successfully edit a category with only color', async () => {
    const [category] = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      color: updatedCategory.color,
      raw: true,
    });

    expect(category!.color).toBe(updatedCategory.color);
    expect(category!.name).toBe(mockedCategory.name);
  });

  it('should return validation error if no fields provided', async () => {
    const response = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should return validation error for invalid color', async () => {
    const res = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      color: 'invalid-color',
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should return validation error for name exceeding 200 characters', async () => {
    const res = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      name: 'a'.repeat(201),
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should return validation error for icon exceeding 50 characters', async () => {
    const res = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      icon: 'a'.repeat(51),
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should return not found error for non-existent category', async () => {
    const res = await helpers.editCustomCategory({
      categoryId: NONEXISTENT_ID,
      name: updatedCategory.name,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });

  describe('Re-parenting', () => {
    it('should move a root category under another root category', async () => {
      const newParent = await helpers.addCustomCategory({
        name: 'new-parent',
        color: mockedCategory.color,
        raw: true,
      });

      const [category] = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: newParent.id,
        raw: true,
      });

      expect(category!.parentId).toBe(newParent.id);

      const stored = (await helpers.getCategoriesList()).find((i) => i.id === testCategory.id);
      expect(stored!.parentId).toBe(newParent.id);
    });

    it('should move a nested category to the top level when parentId is null', async () => {
      const child = await helpers.addCustomCategory({
        parentId: testCategory.id,
        name: 'child',
        raw: true,
      });

      const [category] = await helpers.editCustomCategory({
        categoryId: child.id,
        parentId: null,
        raw: true,
      });

      expect(category!.parentId).toBe(null);

      const stored = (await helpers.getCategoriesList()).find((i) => i.id === child.id);
      expect(stored!.parentId).toBe(null);
    });

    it('should allow moving a category with a child under a root (subtree lands exactly on the limit)', async () => {
      const newParent = await helpers.addCustomCategory({
        name: 'new-parent',
        color: mockedCategory.color,
        raw: true,
      });
      await helpers.addCustomCategory({
        parentId: testCategory.id,
        name: 'child',
        raw: true,
      });

      const [category] = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: newParent.id,
        raw: true,
      });

      expect(category!.parentId).toBe(newParent.id);
    });

    it('should return validation error when moving a system category', async () => {
      const internal = (await helpers.getCategoriesList()).find((i) => i.type === CATEGORY_TYPES.internal);

      const res = await helpers.editCustomCategory({
        categoryId: internal!.id,
        parentId: testCategory.id,
        raw: false,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return validation error when using a system category as a parent', async () => {
      const internal = (await helpers.getCategoriesList()).find((i) => i.type === CATEGORY_TYPES.internal);

      const res = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: internal!.id,
        raw: false,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should allow a move that lands exactly on the third level', async () => {
      const grandParent = await helpers.addCustomCategory({
        name: 'grand-parent',
        color: mockedCategory.color,
        raw: true,
      });
      const parent = await helpers.addCustomCategory({
        parentId: grandParent.id,
        name: 'parent',
        raw: true,
      });

      const [category] = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: parent.id,
        raw: true,
      });

      expect(category!.parentId).toBe(parent.id);
    });

    it('should return validation error for a non-existent parentId', async () => {
      const res = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: NONEXISTENT_ID,
        raw: false,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return validation error when moving a category under its own descendant', async () => {
      const child = await helpers.addCustomCategory({
        parentId: testCategory.id,
        name: 'child',
        raw: true,
      });

      const res = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: child.id,
        raw: false,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return validation error when moving a category under itself', async () => {
      const res = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: testCategory.id,
        raw: false,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return validation error when the move would exceed 3 nesting levels', async () => {
      const grandParent = await helpers.addCustomCategory({
        name: 'grand-parent',
        color: mockedCategory.color,
        raw: true,
      });
      const parent = await helpers.addCustomCategory({
        parentId: grandParent.id,
        name: 'parent',
        raw: true,
      });
      await helpers.addCustomCategory({
        parentId: testCategory.id,
        name: 'child',
        raw: true,
      });

      const res = await helpers.editCustomCategory({
        categoryId: testCategory.id,
        parentId: parent.id,
        raw: false,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });
  });
});
