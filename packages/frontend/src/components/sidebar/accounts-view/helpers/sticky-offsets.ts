/**
 * Sticky-offset ladders for the stacked, collapsible sidebar sections. Section headers stick to
 * the top as you scroll down and pile at the bottom as you scroll back up; each header is one
 * step (~2.25rem) tall. A section therefore sits `TOP_OFFSET_CLASSES[sectionsAbove]` from the top
 * and `BOTTOM_OFFSET_CLASSES[sectionsBelow]` from the bottom.
 *
 * The class strings are kept as literals so Tailwind's scanner emits them — a computed
 * `` `top-${n}` `` would never be found. Both ladders carry one step per section, so they must be
 * at least as long as the number of sections; `computeStickyOffsets` throws rather than let a new
 * section silently clamp to the last step and overlap its neighbour.
 */
export const TOP_OFFSET_CLASSES = ['top-0', 'top-9', 'top-18', 'top-27', 'top-36'] as const;
export const BOTTOM_OFFSET_CLASSES = ['bottom-0', 'bottom-9', 'bottom-18', 'bottom-27', 'bottom-36'] as const;

export interface StickyOffset {
  top: string;
  bottom: string;
}

/**
 * Maps every section to its sticky top/bottom offset classes from the ordered list of currently
 * visible sections. Sections absent from `visibleInOrder` (hidden) get the base `top-0`/`bottom-0`.
 * A section's top offset is one step per visible section above it, its bottom offset one step per
 * visible section below it — so the first visible section anchors at `top-0` and the last at
 * `bottom-0`.
 *
 * Throws if more sections are visible than the ladders have steps: that can only happen when a new
 * section is added without extending the ladders, and is a loud failure by design (a silent clamp
 * would stack two headers at the same offset).
 */
export const computeStickyOffsets = <TKey extends string>({
  allKeys,
  visibleInOrder,
}: {
  allKeys: readonly TKey[];
  visibleInOrder: readonly TKey[];
}): Record<TKey, StickyOffset> => {
  if (visibleInOrder.length > TOP_OFFSET_CLASSES.length) {
    throw new Error(
      `computeStickyOffsets: ${visibleInOrder.length} visible sections exceed the ${TOP_OFFSET_CLASSES.length}-step offset ladder`,
    );
  }

  const offsets = {} as Record<TKey, StickyOffset>;
  for (const key of allKeys) {
    offsets[key] = { top: TOP_OFFSET_CLASSES[0], bottom: BOTTOM_OFFSET_CLASSES[0] };
  }

  visibleInOrder.forEach((key, index) => {
    const sectionsBelow = visibleInOrder.length - 1 - index;
    offsets[key] = {
      top: TOP_OFFSET_CLASSES[index] ?? TOP_OFFSET_CLASSES[TOP_OFFSET_CLASSES.length - 1] ?? 'top-0',
      bottom:
        BOTTOM_OFFSET_CLASSES[sectionsBelow] ?? BOTTOM_OFFSET_CLASSES[BOTTOM_OFFSET_CLASSES.length - 1] ?? 'bottom-0',
    };
  });

  return offsets;
};
