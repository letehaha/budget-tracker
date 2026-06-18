import type { CategoryMappingConfig } from '@bt/shared/types';
import { CATEGORY_TYPES } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import Categories from '@models/categories.model';
import { Op, col, fn, where as sequelizeWhere } from 'sequelize';

import { pickRandomColor } from './pick-random-color';

interface CreateCategoriesIfNeededParams {
  userId: number;
  categoryMapping: CategoryMappingConfig;
}

interface CreateCategoriesIfNeededResult {
  /**
   * Resolved category id per distinct source category string. Many source
   * strings may resolve to the same id (many-to-one is intentional).
   */
  categoryNameToId: Map<string, string>;
  /** Number of categories actually inserted. Reused/linked categories don't count. */
  categoriesCreated: number;
}

/**
 * Resolve each distinct source category string in `categoryMapping` to a
 * category id, creating categories where the user chose `create-new`.
 *
 * - `link-existing`: verify the category id belongs to the user, then map to it.
 * - `create-new`: find-or-create by name, case-insensitively. When the user
 *   already owns a category with the same name (any casing) the source string
 *   links to that category instead of inserting a duplicate, and it isn't
 *   counted as created. Only a genuine insert increments `categoriesCreated`.
 */
export async function createCategoriesIfNeeded({
  userId,
  categoryMapping,
}: CreateCategoriesIfNeededParams): Promise<CreateCategoriesIfNeededResult> {
  const categoryNameToId = new Map<string, string>();
  let categoriesCreated = 0;

  for (const [sourceName, mapping] of Object.entries(categoryMapping)) {
    if (mapping.action === 'link-existing') {
      const category = await Categories.findOne({ where: { id: mapping.categoryId, userId } });
      if (!category) {
        throw new ValidationError({
          message: `Category with ID ${mapping.categoryId} not found`,
        });
      }
      categoryNameToId.set(sourceName, category.id);
      continue;
    }

    // create-new: reuse a same-named category (case-insensitive) before
    // inserting. Compare lower(name) to the lowercased source so an EXACT
    // case-insensitive match is required. Op.iLike is unusable here: `%`/`_` in
    // the CSV-supplied sourceName would act as ILIKE wildcards, letting `50%`
    // match `50% off`.
    const existing = await Categories.findOne({
      where: { userId, [Op.and]: [sequelizeWhere(fn('lower', col('name')), sourceName.toLowerCase())] },
    });
    if (existing) {
      categoryNameToId.set(sourceName, existing.id);
      continue;
    }

    const created = await Categories.create({
      userId,
      name: sourceName,
      color: pickRandomColor(),
      type: CATEGORY_TYPES.custom,
    });
    categoryNameToId.set(sourceName, created.id);
    categoriesCreated += 1;
  }

  return { categoryNameToId, categoriesCreated };
}
