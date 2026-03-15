import { api } from '@/api/_api';
import { CategoryModel, endpointsTypes } from '@bt/shared/types';

export const loadSystemCategories = async (): Promise<CategoryModel[]> => {
  const result = await api.get('/categories');

  return result;
};

export const createCategory = async (
  params: endpointsTypes.CreateCategoryBody,
): Promise<endpointsTypes.CreateCategoryResponse> => {
  const result = await api.post('/categories', params);

  return result;
};

export const editCategory = async ({
  categoryId,
  ...params
}: endpointsTypes.EditCategoryBody & {
  categoryId: number;
}): Promise<endpointsTypes.EditCategoryResponse> => {
  const result = await api.put(`/categories/${categoryId}`, params);

  return result;
};

export const deleteCategory = async ({
  categoryId,
  replaceWithCategoryId,
}: {
  categoryId: number;
  replaceWithCategoryId?: number;
}) => {
  await api.delete(`/categories/${categoryId}`, {
    data: replaceWithCategoryId ? { replaceWithCategoryId } : undefined,
  });
};

export const getCategoryTransactionCount = async ({
  categoryId,
}: {
  categoryId: number;
}): Promise<{ transactionCount: number }> => {
  return api.get(`/categories/${categoryId}/transaction-count`);
};
