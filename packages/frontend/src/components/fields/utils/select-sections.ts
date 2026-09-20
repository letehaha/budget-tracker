export interface SelectPinnedGroup<T> {
  isPinned: (item: T) => boolean;
  pinnedLabel: string;
  restLabel: string;
}

export interface SelectSection<T> {
  /** Null for a plain, ungrouped list. */
  label: string | null;
  items: T[];
}

/** Every item lands in exactly one section; a list that is all pinned or all unpinned stays ungrouped. */
export const buildSelectSections = <T>({
  items,
  pinnedGroup,
}: {
  items: T[];
  pinnedGroup?: SelectPinnedGroup<T>;
}): SelectSection<T>[] => {
  if (!pinnedGroup) return [{ label: null, items }];

  const pinned = items.filter((item) => pinnedGroup.isPinned(item));
  if (pinned.length === 0 || pinned.length === items.length) return [{ label: null, items }];

  return [
    { label: pinnedGroup.pinnedLabel, items: pinned },
    { label: pinnedGroup.restLabel, items: items.filter((item) => !pinnedGroup.isPinned(item)) },
  ];
};
