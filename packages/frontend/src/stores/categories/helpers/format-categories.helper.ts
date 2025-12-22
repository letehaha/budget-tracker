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

export const buildCategiesObjectGraph = (items: CategoryModel[]): FormattedCategory[] => {
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
    const nodes = !parentId ? roots : itemsById[parentId].subCategories;
    nodes.push(item);
  });

  // Sort so internal categories appear at the bottom
  return sortCategoriesWithInternalLast(roots);
};
