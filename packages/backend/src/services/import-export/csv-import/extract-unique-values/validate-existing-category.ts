import { CategoryOptionValue, type ColumnMappingConfig } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import Categories from '@models/Categories.model';

interface ValidateExistingCategoryParams {
  userId: number;
  columnMapping: ColumnMappingConfig;
}

/**
 * Validates that the selected existing category belongs to the user
 */
export async function validateExistingCategory({
  userId,
  columnMapping,
}: ValidateExistingCategoryParams): Promise<void> {
  const categoryOption = columnMapping.category;

  if (categoryOption.option === CategoryOptionValue.existingCategory) {
    const category = await Categories.findOne({
      where: {
        id: categoryOption.categoryId,
        userId,
      },
    });

    if (!category) {
      throw new NotFoundError({
        message: `Category with ID ${categoryOption.categoryId} not found or does not belong to you.`,
      });
    }
  }
}
