import { AccessibleCategoryInfo } from './get-accessible-category-map.service';

/**
 * Walks parentId links from a category up to its root, returning the root category id.
 *
 * The walk stops early — returning the deepest resolvable ancestor — when a parentId points at
 * a category missing from the map, so a dangling parent link can never yield an undefined walk.
 * A categoryId that is not in the map at all resolves to itself.
 */
export const getRootCategoryId = ({
  categoryId,
  byId,
}: {
  categoryId: string;
  byId: Map<string, AccessibleCategoryInfo>;
}): string => {
  let current = byId.get(categoryId);
  if (!current) return categoryId;

  while (current.parentId !== null) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }

  return current.id;
};

/**
 * A memoized `getRootCategoryId` bound to one category map. Stats aggregations resolve the same
 * category's root many times per request; the cache turns each repeat into an O(1) lookup.
 */
export const createRootCategoryResolver = ({
  byId,
}: {
  byId: Map<string, AccessibleCategoryInfo>;
}): ((categoryId: string) => string) => {
  const cache = new Map<string, string>();
  return (categoryId: string): string => {
    const cached = cache.get(categoryId);
    if (cached !== undefined) return cached;
    const rootId = getRootCategoryId({ categoryId, byId });
    cache.set(categoryId, rootId);
    return rootId;
  };
};

/**
 * Expands a set of selected category ids to also include every descendant, so selecting a parent
 * category matches transactions filed directly under any of its subcategories. Each category is
 * kept when itself or any ancestor is in the selected set. The originally selected ids are always
 * present in the result.
 */
export const expandCategoryIdsWithDescendants = ({
  categoryIds,
  categories,
  byId,
}: {
  categoryIds: string[];
  categories: AccessibleCategoryInfo[];
  byId: Map<string, AccessibleCategoryInfo>;
}): string[] => {
  const expanded = new Set<string>(categoryIds);

  for (const cat of categories) {
    let current: AccessibleCategoryInfo | undefined = byId.get(cat.id);
    while (current) {
      if (categoryIds.includes(current.id)) {
        expanded.add(cat.id);
        break;
      }
      if (current.parentId === null) break;
      current = byId.get(current.parentId);
    }
  }

  return [...expanded];
};
