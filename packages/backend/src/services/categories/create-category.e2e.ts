import { CategoryModel } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

const CATEGORY_NAME = 'test-1';
const CATEGORY_COLOR = '#FF0000';

describe('Create custom categories and subcategories', () => {
  const rootCategories: CategoryModel[] = [];

  beforeEach(async () => {
    rootCategories.push(...(await helpers.getCategoriesList()));
  });

  it('should successfully create a custom categories', async () => {
    const parent = rootCategories[0];
    await helpers.addCustomCategory({
      parentId: parent!.id,
      name: CATEGORY_NAME,
    });
    const newCategory = (await helpers.getCategoriesList()).find((i) => i.name === CATEGORY_NAME);

    expect(newCategory!.parentId).toBe(parent!.id);
  });

  it('should successfully create a custom category with color when no parentId', async () => {
    await helpers.addCustomCategory({
      name: CATEGORY_NAME,
      color: CATEGORY_COLOR,
    });
    const newCategory = (await helpers.getCategoriesList()).find((i) => i.name === CATEGORY_NAME);

    expect(newCategory!.color).toBe(CATEGORY_COLOR);
  });

  it('should allow creating duplicate categories', async () => {
    const parent = rootCategories[0];
    await helpers.addCustomCategory({
      parentId: parent!.id,
      name: CATEGORY_NAME,
    });
    await helpers.addCustomCategory({
      parentId: parent!.id,
      name: CATEGORY_NAME,
    });

    const newCategories = await helpers.getCategoriesList();

    expect(newCategories.filter((i) => i.name === CATEGORY_NAME).length).toBe(2);
  });

  it('should return validation error if no color provided when no parentId', async () => {
    const res = await helpers.addCustomCategory({
      name: CATEGORY_NAME,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
  it('should return validation error if no name provided when no parentId', async () => {
    const res = await helpers.addCustomCategory({
      color: CATEGORY_COLOR,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
  it('should return validation error if no data provided', async () => {
    const res = await helpers.addCustomCategory({ raw: false });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should not allow creating category with non-existent parent', async () => {
    const res = await helpers.addCustomCategory({ parentId: 9999, raw: false });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should use parent color if not provided for subcategory', async () => {
    const parent = rootCategories[0];
    const newCategory = await helpers.addCustomCategory({
      parentId: parent!.id,
      name: CATEGORY_NAME,
      raw: true,
    });

    expect(newCategory.color).toEqual(parent!.color);
  });
});
