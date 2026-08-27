import { CATEGORY_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import * as Categories from '@models/categories.model';
import { withTransaction } from '@services/common/with-transaction';

import { validateParentAssignment } from './validate-parent-assignment';

const validateMove = async ({
  userId,
  categoryId,
  parentId,
}: {
  userId: number;
  categoryId: string;
  parentId: string | null;
}) => {
  const categories = await Categories.getCategories({ userId });
  const category = categories.find((item) => item.id === categoryId);

  if (!category) {
    throw new NotFoundError({ message: t({ key: 'categories.notFound' }) });
  }

  if (category.type === CATEGORY_TYPES.internal) {
    throw new ValidationError({ message: t({ key: 'categories.systemCannotBeMoved' }) });
  }

  if (parentId === null) return;

  validateParentAssignment({ categories, categoryId, parentId });
};

export const editCategory = withTransaction(async (payload: Categories.EditCategoryPayload) => {
  if (payload.parentId !== undefined) {
    await validateMove({ userId: payload.userId, categoryId: payload.categoryId, parentId: payload.parentId });
  }

  const result = await Categories.editCategory(payload);

  return result;
});
