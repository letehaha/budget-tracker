import { api } from '@/api/_api';
import { CategoryModel, endpointsTypes } from '@bt/shared/types';

export const loadSystemCategories = async (): Promise<CategoryModel[]> => {
  // `includeAccessible` widens the result to the union of the caller's categories plus
  // every category referenced by an account they can read. Read-only displays
  // (transaction lists, widgets) use this to resolve names and icons for txs on
  // shared accounts without an N+1 lookup. The picker still narrows to the caller's
  // own set on its render path.
  const result = await api.get('/categories', { includeAccessible: true });

  return result;
};

export const loadCategoriesByAccount = async ({ accountId }: { accountId: string }): Promise<CategoryModel[]> => {
  const result = await api.get('/categories', { accountId });

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
  categoryId: string;
}): Promise<endpointsTypes.EditCategoryResponse> => {
  const result = await api.put(`/categories/${categoryId}`, params);

  return result;
};

export const deleteCategory = async ({
  categoryId,
  replaceWithCategoryId,
}: {
  categoryId: string;
  replaceWithCategoryId?: string;
}) => {
  await api.delete(`/categories/${categoryId}`, {
    data: replaceWithCategoryId ? { replaceWithCategoryId } : undefined,
  });
};

export const getCategoryTransactionCount = async ({
  categoryId,
}: {
  categoryId: string;
}): Promise<{ transactionCount: number }> => {
  return api.get(`/categories/${categoryId}/transaction-count`);
};
