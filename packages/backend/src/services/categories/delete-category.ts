import { API_ERROR_CODES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError, ValidationError } from '@js/errors';
import * as Categories from '@models/categories.model';
import { countTransactions, updateTransactions } from '@models/transactions-query';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteCategoryPayload extends Categories.DeleteCategoryPayload {
  replaceWithCategoryId?: string;
}

export const deleteCategory = withTransaction(async (payload: DeleteCategoryPayload) => {
  await findOrThrowNotFound({
    query: Categories.default.findOne({ where: { id: payload.categoryId } }),
    message: 'Category with provided id does not exist.',
  });

  const parentCategory = await Categories.default.findOne({
    where: { parentId: payload.categoryId },
  });

  if (parentCategory) {
    throw new ValidationError({
      message:
        'For now you cannot delete category that is a parent for any subcategory. You need to delete all its subcategories first.',
    });
  }

  // Total reach on both axes: every row pointing at the category must be reassigned
  // before it can be dropped, so anything this count misses becomes an FK violation.
  const transactionCount = await countTransactions({
    where: { categoryId: payload.categoryId },
    planned: 'include',
    access: { creator: payload.userId },
    balanceAdjustments: 'include',
  });

  if (transactionCount > 0) {
    if (!payload.replaceWithCategoryId) {
      throw new ConflictError({
        code: API_ERROR_CODES.categoryHasTransactions,
        message: 'Category has linked transactions that need to be reassigned.',
        details: { transactionCount },
      });
    }

    await findOrThrowNotFound({
      query: Categories.default.findOne({
        where: { id: payload.replaceWithCategoryId, userId: payload.userId },
      }),
      message: 'Replacement category does not exist.',
    });

    await updateTransactions({
      values: { categoryId: payload.replaceWithCategoryId },
      where: { categoryId: payload.categoryId },
      planned: 'include',
      access: { creator: payload.userId },
      balanceAdjustments: 'include',
    });
  }

  await Categories.deleteCategory(payload);
});
