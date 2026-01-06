import { CategoryModel } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

const mockedCategory = {
  name: 'test-category',
  color: '#FF0000',
  imageUrl: 'https://example.com/image.jpg',
};
const updatedCategory = {
  name: 'updated-test-category',
  color: '#00FF00',
  imageUrl: 'https://example.com/updated-image.jpg',
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
    expect(category!.imageUrl).toBe(updatedCategory.imageUrl);
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
    expect(category!.imageUrl).toBe(updatedCategory.imageUrl);
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

  it('should return validation error for invalid image URL', async () => {
    const res = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      imageUrl: 'invalid-url',
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

  it('should return validation error for imageUrl exceeding 500 characters', async () => {
    const res = await helpers.editCustomCategory({
      categoryId: testCategory.id,
      imageUrl: `http://example.com/${'a'.repeat(500)}`,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should return not found error for non-existent category', async () => {
    const res = await helpers.editCustomCategory({
      categoryId: 9999,
      name: updatedCategory.name,
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });
});
