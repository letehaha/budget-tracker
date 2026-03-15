import * as Categories from '@models/categories.model';
import { withTransaction } from '@services/common/with-transaction';

export const createCategory = withTransaction(async (payload: Categories.CreateCategoryPayload) => {
  const result = await Categories.createCategory(payload);

  return result;
});
