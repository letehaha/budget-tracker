import { type FormattedCategory } from '@/common/types';
import { CATEGORY_TYPES, CategoryModel } from '@bt/shared/types';

/**
 * Sorts categories so that internal categories come last
 */
const sortCategoriesWithInternalLast = (categories: FormattedCategory[]): FormattedCategory[] => {
  return categories.sort((a, b) => {
    const aIsInternal = a.type === CATEGORY_TYPES.internal;
    const bIsInternal = b.type === CATEGORY_TYPES.internal;

    if (aIsInternal && !bIsInternal) return 1;
    if (!aIsInternal && bIsInternal) return -1;
    return 0;
  });
};

/**
 * Walks the tree built by `buildCategoriesObjectGraph` and returns the node
 * whose id matches. A plain `Array.find()` over the top-level array only sees
 * roots — subcategories live under each root's `subCategories`, so a flat find
 * silently misses them.
 */
export const findFormattedCategoryById = (categories: FormattedCategory[], id: string): FormattedCategory | null => {
  for (const cat of categories) {
    if (cat.id === id) return cat;
    const found = findFormattedCategoryById(cat.subCategories ?? [], id);
    if (found) return found;
  }
  return null;
};

export const buildCategoriesObjectGraph = (items: CategoryModel[]): FormattedCategory[] => {
  const itemsById: Record<string, FormattedCategory> = {};
  const roots: FormattedCategory[] = [];
  const tempItems: FormattedCategory[] = items.map((item) => {
    const tempItem: FormattedCategory = {
      ...item,
      subCategories: [],
    };
    // build an id->object mapping, so we don't have to go hunting for parents
    itemsById[item.id] = tempItem;

    return tempItem;
  });

  tempItems.forEach((item) => {
    const { parentId } = item;
    // if parentId is null, this is a root; otherwise, it's parentId's kid
    const nodes = !parentId ? roots : itemsById[parentId]!.subCategories;
    nodes.push(item);
  });

  // Sort so internal categories appear at the bottom
  return sortCategoriesWithInternalLast(roots);
};
