import Categories from '@models/Categories.model';
import { Op } from 'sequelize';

/**
 * Expands a list of category IDs to include all child categories.
 * When a parent category is selected, all its children are automatically included.
 */
export const expandCategoryIds = async ({
  userId,
  categoryIds,
}: {
  userId: number;
  categoryIds: number[];
}): Promise<number[]> => {
  if (!categoryIds.length) return [];

  // Find all categories that match the given IDs OR have a parentId matching given IDs
  const allCategories = await Categories.findAll({
    where: {
      userId,
      [Op.or]: [{ id: { [Op.in]: categoryIds } }, { parentId: { [Op.in]: categoryIds } }],
    },
    attributes: ['id'],
    raw: true,
  });

  return [...new Set(allCategories.map((c) => c.id))];
};
