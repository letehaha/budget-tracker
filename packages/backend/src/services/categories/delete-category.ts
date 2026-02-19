import { API_ERROR_CODES } from '@bt/shared/types';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import * as Categories from '@models/Categories.model';
import Transactions, * as TransactionsModel from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { editExcludedCategories } from '@services/user-settings/edit-excluded-categories';

interface DeleteCategoryPayload extends Categories.DeleteCategoryPayload {
  replaceWithCategoryId?: number;
}

export const deleteCategory = withTransaction(async (payload: DeleteCategoryPayload) => {
  const rootCategory = await Categories.default.findOne({
    where: { id: payload.categoryId },
  });

  if (!rootCategory) {
    throw new NotFoundError({
      message: 'Category with provided id does not exist.',
    });
  }

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

    const replacementCategory = await Categories.default.findOne({
      where: { id: payload.replaceWithCategoryId, userId: payload.userId },
    });

    if (!replacementCategory) {
      throw new NotFoundError({
        message: 'Replacement category does not exist.',
      });
    }

    await TransactionsModel.updateTransactions(
      { categoryId: payload.replaceWithCategoryId },
      { userId: payload.userId, categoryId: payload.categoryId },
      { individualHooks: false },
    );
  }

  await editExcludedCategories({
    userId: payload.userId,
    removeIds: [payload.categoryId],
  });

  await Categories.deleteCategory(payload);
});
