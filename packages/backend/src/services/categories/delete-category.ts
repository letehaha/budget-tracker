import { API_ERROR_CODES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError, ValidationError } from '@js/errors';
import * as Categories from '@models/categories.model';
import Transactions, * as TransactionsModel from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteCategoryPayload extends Categories.DeleteCategoryPayload {
  replaceWithCategoryId?: number;
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

  const transactionCount = await Transactions.count({
    where: {
      userId: payload.userId,
      categoryId: payload.categoryId,
    },
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

    await TransactionsModel.updateTransactions(
      { categoryId: payload.replaceWithCategoryId },
      { userId: payload.userId, categoryId: payload.categoryId },
      { individualHooks: false },
    );
  }

  await Categories.deleteCategory(payload);
});
