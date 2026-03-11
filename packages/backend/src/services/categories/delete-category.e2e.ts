import { CategoryModel } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Delete custom categories', () => {
  let rootCategory: CategoryModel;
  let subCategory: CategoryModel;
  let categoryWithTransaction: CategoryModel;

  beforeEach(async () => {
    rootCategory = await helpers.addCustomCategory({
      name: 'Root Category',
      color: '#FF0000',
      raw: true,
    });
    subCategory = await helpers.addCustomCategory({
      name: 'Sub Category',
      parentId: rootCategory.id,
      raw: true,
    });
    categoryWithTransaction = await helpers.addCustomCategory({
      name: 'Category with Transaction',
      raw: true,
    });
    const account = await helpers.createAccount({ raw: true });
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categoryWithTransaction.id,
      amount: 100,
    });
    await helpers.createTransaction({
      payload: txPayload,
    });
  });

  it('should successfully delete a category without subcategories or transactions', async () => {
    const customRootCategory = await helpers.addCustomCategory({
      name: 'Root Category',
      color: '#FF0000',
      raw: true,
    });
    const res = await helpers.deleteCustomCategory({
      categoryId: customRootCategory.id,
      raw: false,
    });

    expect(res.status).toBe(200);

    const categories = await helpers.getCategoriesList();
    expect(categories.find((c) => c.id === customRootCategory.id)).toBeUndefined();
  });

  it('should successfully delete a sub-category without subcategories or transactions', async () => {
    const res = await helpers.deleteCustomCategory({
      categoryId: subCategory.id,
      raw: false,
    });

    expect(res.status).toBe(200);

    const categories = await helpers.getCategoriesList();
    expect(categories.find((c) => c.id === subCategory.id)).toBeUndefined();
  });

  it('should return validation error when trying to delete a category with subcategories', async () => {
    const res = await helpers.deleteCustomCategory({
      categoryId: rootCategory.id,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should return validation error when trying to delete a category with linked transactions', async () => {
    const res = await helpers.deleteCustomCategory({
      categoryId: categoryWithTransaction.id,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should return not found error for non-existent category', async () => {
    const res = await helpers.deleteCustomCategory({
      categoryId: 9999,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });
  it('should return validation error when category id is invalid', async () => {
    const res = await helpers.deleteCustomCategory({
      categoryId: 'invalid-category-id',
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
});
