import type { CategoryMappingConfig, MsMoneyParseCategory } from '@bt/shared/types';
import {
  createCategoriesIfNeeded,
  createTwoLevelCategoriesIfNeeded,
} from '@services/import-export/core/resolve/create-categories-if-needed';

interface ResolveMsMoneyCategoriesParams {
  userId: number;
  /** Categories the parser found in the file. Supplies the group/leaf split that
   *  the flat mapping payload cannot express. */
  categories: MsMoneyParseCategory[];
  /** Keyed by `MsMoneyParseCategory.fullName`. */
  categoryMapping: CategoryMappingConfig;
}

interface ResolveMsMoneyCategoriesResult {
  /** Resolved category id per `fullName`. */
  categoryIdByFullName: Map<string, string>;
  /** Number of categories actually inserted (parents included). Reused ones don't count. */
  categoriesCreated: number;
}

/**
 * Resolve each mapped Money category to an app category id.
 *
 * Money nests categories two levels deep ("Auto:Gas"), so creating a leaf also
 * has to create its parent group — but the mapping payload is flat and carries
 * only the full name. The parsed category list supplies the missing split: a
 * create-new leaf goes through the two-level resolver, a create-new group and
 * every link-existing choice through the flat one. Both key their result by the
 * full name, so the row loop reads one merged map.
 *
 * Categories the user left out of the mapping are absent from the result, so
 * their rows import without a category rather than being silently created.
 */
export async function resolveMsMoneyCategories({
  userId,
  categories,
  categoryMapping,
}: ResolveMsMoneyCategoriesParams): Promise<ResolveMsMoneyCategoriesResult> {
  const flatMapping: CategoryMappingConfig = {};
  const twoLevelCategories: { groupName: string; categoryName: string; fullName: string }[] = [];

  for (const category of categories) {
    const mapping = categoryMapping[category.fullName];
    if (!mapping) continue;

    if (mapping.action === 'create-new' && category.groupName) {
      twoLevelCategories.push({
        groupName: category.groupName,
        categoryName: category.name,
        fullName: category.fullName,
      });
    } else {
      // A group has no parent to build, and link-existing only needs an
      // ownership check — both are the flat resolver's job.
      flatMapping[category.fullName] = mapping;
    }
  }

  const { categoryNameToId, categoriesCreated: flatCreated } = await createCategoriesIfNeeded({
    userId,
    categoryMapping: flatMapping,
  });
  const { categoryIdByFullName, categoriesCreated: twoLevelCreated } = await createTwoLevelCategoriesIfNeeded({
    userId,
    categories: twoLevelCategories,
  });

  const merged = new Map<string, string>(categoryNameToId);
  for (const [fullName, categoryId] of categoryIdByFullName) {
    merged.set(fullName, categoryId);
  }

  return { categoryIdByFullName: merged, categoriesCreated: flatCreated + twoLevelCreated };
}
