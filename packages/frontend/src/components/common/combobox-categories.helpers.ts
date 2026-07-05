import { type FormattedCategory } from '@/common/types';
import { type CheckedState } from '@/components/lib/ui/checkbox';
import { CATEGORY_TYPES } from '@bt/shared/types';

export interface FlatCategory extends FormattedCategory {
  depth: number;
  rootParentId: string;
  rootParentName: string;
  descendantIds: string[];
}

export const collectDescendantIds = ({ category }: { category: FormattedCategory }): string[] => {
  const ids: string[] = [];
  if (category.subCategories?.length) {
    for (const child of category.subCategories) {
      ids.push(child.id);
      ids.push(...collectDescendantIds({ category: child }));
    }
  }
  return ids;
};

export const sortInternalLast = ({ roots }: { roots: FormattedCategory[] }): FormattedCategory[] =>
  [...roots].sort((a, b) => {
    if (a.type === CATEGORY_TYPES.internal && b.type !== CATEGORY_TYPES.internal) return 1;
    if (a.type !== CATEGORY_TYPES.internal && b.type === CATEGORY_TYPES.internal) return -1;
    return 0;
  });

export const flattenCategories = ({
  categories,
  depth = 0,
  rootParent,
}: {
  categories: FormattedCategory[];
  depth?: number;
  rootParent?: { id: string; name: string };
}): FlatCategory[] => {
  const result: FlatCategory[] = [];

  for (const category of categories) {
    const currentRoot = rootParent ?? { id: category.id, name: category.name };

    result.push({
      ...category,
      depth,
      rootParentId: currentRoot.id,
      rootParentName: currentRoot.name,
      descendantIds: collectDescendantIds({ category }),
    });

    if (category.subCategories?.length > 0) {
      result.push(
        ...flattenCategories({
          categories: category.subCategories,
          depth: depth + 1,
          rootParent: currentRoot,
        }),
      );
    }
  }

  return result;
};

export const computeCheckedState = ({
  item,
  selectedIds,
  isSearching,
  independent = false,
}: {
  item: FlatCategory;
  selectedIds: ReadonlySet<string>;
  isSearching: boolean;
  /**
   * Check a row purely on its own membership — no parent roll-up, no indeterminate
   * tri-state from descendant selection. Toggling still cascades down (clicking a
   * parent selects its whole subtree); this only stops a selected child from making
   * its ancestors *look* selected. The flattened search view reads self-only too.
   */
  independent?: boolean;
}): CheckedState => {
  const isSelfSelected = selectedIds.has(item.id);

  if (isSearching || independent) return isSelfSelected;
  if (item.descendantIds.length === 0) return isSelfSelected;

  const selectedDescendantCount = item.descendantIds.filter((id) => selectedIds.has(id)).length;

  if (isSelfSelected && selectedDescendantCount === item.descendantIds.length) return true;
  if (!isSelfSelected && selectedDescendantCount === 0) return false;
  return 'indeterminate';
};

const idsAffectedByToggle = ({ target, isSearching }: { target: FlatCategory; isSearching: boolean }): string[] =>
  isSearching ? [target.id] : [target.id, ...target.descendantIds];

export const toggleCategorySelection = ({
  item,
  clickedIndex,
  currentSelection,
  displayedItems,
  isSearching,
  isShiftPressed,
  lastClickedIndex,
}: {
  item: FlatCategory;
  clickedIndex: number;
  currentSelection: readonly string[];
  displayedItems: readonly FlatCategory[];
  isSearching: boolean;
  isShiftPressed: boolean;
  lastClickedIndex: number | null;
}): string[] => {
  const nextSet = new Set(currentSelection);
  const clickedIds = idsAffectedByToggle({ target: item, isSearching });
  const allClickedSelected = clickedIds.every((id) => nextSet.has(id));
  const shouldSelect = !allClickedSelected;

  const applyToItem = (target: FlatCategory) => {
    for (const id of idsAffectedByToggle({ target, isSearching })) {
      if (shouldSelect) nextSet.add(id);
      else nextSet.delete(id);
    }
  };

  applyToItem(item);

  if (isShiftPressed && lastClickedIndex !== null && clickedIndex !== lastClickedIndex) {
    const start = Math.min(lastClickedIndex, clickedIndex);
    const end = Math.max(lastClickedIndex, clickedIndex);
    for (let i = start; i <= end; i++) {
      const rangeItem = displayedItems[i];
      if (rangeItem) applyToItem(rangeItem);
    }
  }

  return Array.from(nextSet);
};

export const computeSessionRootOrder = ({
  roots,
  selectedIds,
}: {
  roots: FormattedCategory[];
  selectedIds: ReadonlySet<string>;
}): string[] => {
  const rootHasSelection = (root: FormattedCategory): boolean => {
    if (selectedIds.has(root.id)) return true;
    return collectDescendantIds({ category: root }).some((id) => selectedIds.has(id));
  };

  const sorted = sortInternalLast({ roots });
  const selectedRoots = sorted.filter(rootHasSelection);
  const otherRoots = sorted.filter((r) => !rootHasSelection(r));
  return [...selectedRoots, ...otherRoots].map((r) => r.id);
};
