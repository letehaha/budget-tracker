import { type FormattedCategory } from '@/common/types';
import { findFormattedCategoryById } from '@/stores/categories/helpers';
import { type RecordId } from '@bt/shared/types';

import { type DraggedCategory, categoryDropError } from './can-drop-category';

export type ParentOption =
  | { kind: 'top-level' }
  /** Root categories have depth 1. */
  | { kind: 'category'; category: FormattedCategory; depth: number };

// Stands in for a not-yet-created category: no id to collide with, no subtree, height 1.
const NEW_CATEGORY_STUB: DraggedCategory = { id: '' as RecordId, parentId: null, subCategories: [] };

/**
 * Options for the "choose a parent" picker. `categoryId: null` means a category being
 * created; a non-null id is resolved inside `tree`, so depth and subtree height come from
 * the same graph and cannot disagree. Invalid parents are hidden rather than disabled; the
 * picker shows a standing hint about the omissions instead. A node that fails is skipped
 * together with its subtree: descendants of the moved category are invalid themselves, and
 * depth conflicts only get worse further down.
 */
export const buildParentOptions = ({
  categoryId,
  tree,
  maxNesting,
}: {
  categoryId: RecordId | null;
  tree: FormattedCategory[];
  maxNesting: number;
}): ParentOption[] => {
  const dragged = (categoryId && findFormattedCategoryById(tree, categoryId)) || NEW_CATEGORY_STUB;
  const options: ParentOption[] = [{ kind: 'top-level' }];

  const visit = (nodes: FormattedCategory[], depth: number) => {
    for (const node of nodes) {
      const error = categoryDropError({ dragged, target: node, targetDepth: depth, maxNesting });

      if (error !== null && error !== 'current-parent') continue;

      options.push({ kind: 'category', category: node, depth });

      visit(node.subCategories, depth + 1);
    }
  };

  visit(tree, 1);

  return options;
};
