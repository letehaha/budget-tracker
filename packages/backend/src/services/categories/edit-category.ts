import * as Categories from '@models/Categories.model';
import { withTransaction } from '@services/common/index';

export const editCategory = withTransaction(async (payload: Categories.EditCategoryPayload) => {
  const result = await Categories.editCategory(payload);

  return result;
});
