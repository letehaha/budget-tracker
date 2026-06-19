/**
 * Flattens the nested category tree into a flat list (depth-first, parents
 * before children). The import wizard needs a flat view in two shapes: a plain
 * list for name-based matching, and an id→category lookup for resolving a stored
 * id back to its category. Both the Map Columns and Resolve Values steps use
 * these, so the recursion lives here once.
 *
 * Kept Vue/Pinia-free so it can be unit-tested in isolation.
 */
import { type FormattedCategory } from '@/common/types';

/** Depth-first flattening of the category tree; parents precede their children. */
export function flattenCategories({ categories }: { categories: FormattedCategory[] }): FormattedCategory[] {
  const flat: FormattedCategory[] = [];

  const walk = (items: FormattedCategory[]) => {
    for (const item of items) {
      flat.push(item);
      if (item.subCategories?.length > 0) walk(item.subCategories);
    }
  };

  walk(categories);
  return flat;
}

/** id → category lookup across the whole (flattened) tree. */
export function buildCategoryMapById({
  categories,
}: {
  categories: FormattedCategory[];
}): Map<string, FormattedCategory> {
  return new Map(flattenCategories({ categories }).map((category) => [category.id, category]));
}
