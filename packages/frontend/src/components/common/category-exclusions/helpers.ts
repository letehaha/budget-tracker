import type { FormattedCategory } from '@/common/types';

import type { ExcludableCategoryNode } from './types';

/**
 * Descendant ids for every category in the tree, so the row counter and the
 * "hiding a parent hides its children" rule both read from one place.
 */
export const buildDescendantMap = ({ categories }: { categories: FormattedCategory[] }): Record<string, string[]> => {
  const map: Record<string, string[]> = {};

  const walk = (node: FormattedCategory): string[] => {
    const descendants: string[] = [];

    for (const child of node.subCategories ?? []) {
      descendants.push(child.id, ...walk(child));
    }

    map[node.id] = descendants;
    return descendants;
  };

  categories.forEach(walk);
  return map;
};

/**
 * Keeps a category when its own name matches, and keeps its ancestors so a match stays reachable
 * instead of appearing at the root with no context. An empty query returns the tree untouched.
 */
export const filterCategoryTree = ({
  categories,
  query,
}: {
  categories: FormattedCategory[];
  query: string;
}): ExcludableCategoryNode[] => {
  const normalized = query.trim().toLowerCase();

  const walk = (nodes: FormattedCategory[]): ExcludableCategoryNode[] =>
    nodes.flatMap((category) => {
      const children = walk(category.subCategories ?? []);
      const selfMatches = !normalized || category.name.toLowerCase().includes(normalized);

      if (!selfMatches && children.length === 0) return [];
      return [{ category, children }];
    });

  return walk(categories);
};

/**
 * Next exclusion set after clicking one row. A category always travels with its subcategories:
 * leaving a child counted under a hidden parent would show up as spend the widget claims to hide.
 */
export const toggleExclusion = ({
  excludedIds,
  categoryId,
  descendantsById,
}: {
  excludedIds: string[];
  categoryId: string;
  descendantsById: Record<string, string[]>;
}): string[] => {
  const next = new Set(excludedIds);
  const subtree = [categoryId, ...(descendantsById[categoryId] ?? [])];

  if (next.has(categoryId)) {
    subtree.forEach((id) => next.delete(id));
  } else {
    subtree.forEach((id) => next.add(id));
  }

  return [...next];
};
