import * as Categories from '@models/categories.model';
import { withTransaction } from '@services/common/with-transaction';

import { validateParentAssignment } from './validate-parent-assignment';

export const createCategory = withTransaction(async (payload: Categories.CreateCategoryPayload) => {
  if (payload.parentId) {
    const categories = await Categories.getCategories({ userId: payload.userId });
    validateParentAssignment({ categories, parentId: payload.parentId });
  }

  const result = await Categories.createCategory(payload);

  return result;
});
