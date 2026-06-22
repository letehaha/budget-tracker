import type { CategoryMappingConfig } from '@bt/shared/types';
import { CATEGORY_TYPES } from '@bt/shared/types';
import Categories from '@models/categories.model';

import { resolveOrCreateByName } from './resolve-or-create-by-name';

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
  const { nameToId, created } = await resolveOrCreateByName({
    userId,
    mapping: Object.fromEntries(
      Object.entries(categoryMapping).map(([sourceName, mapping]) => [
        sourceName,
        mapping.action === 'link-existing'
          ? { action: 'link-existing' as const, id: mapping.categoryId }
          : { action: 'create-new' as const },
      ]),
    ),
    findOne: (args) => Categories.findOne(args),
    create: ({ userId: ownerId, name, color }) =>
      Categories.create({ userId: ownerId, name, color, type: CATEGORY_TYPES.custom }),
    notFoundMessage: (id) => `Category with ID ${id} not found`,
  });

  return { categoryNameToId: nameToId, categoriesCreated: created };
}
