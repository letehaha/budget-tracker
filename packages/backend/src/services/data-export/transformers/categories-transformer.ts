import { CATEGORY_TYPES } from '@bt/shared/types';
import Categories from '@models/categories.model';

import type { CategoryRow } from '../types';
import { resolveRelationName } from './utils';

export async function transformCategories({ userId }: { userId: number }): Promise<CategoryRow[]> {
  const categories = await Categories.findAll({ where: { userId }, order: [['name', 'ASC']] });

  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return categories.map(
    (cat): CategoryRow => ({
      name: cat.name,
      parentCategory: cat.parentId
        ? resolveRelationName({
            id: cat.parentId,
            nameById,
            relation: 'category',
            context: `category ${cat.id} parent`,
          })
        : '',
      color: cat.color,
      icon: cat.icon ?? '',
      isSystem: cat.type !== CATEGORY_TYPES.custom,
    }),
  );
}
