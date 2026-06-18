/**
 * Resolve a single row's tag names to the tag ids to attach. Names with no
 * entry in `tagNameToId` (a `skip` mapping or a value the user never mapped)
 * are dropped, and the resulting ids are deduplicated: distinct source names
 * can resolve to the same id (many-to-one), and a name can repeat within one
 * row's cell. First-seen order is preserved.
 */
export function resolveRowTagIds({
  tagNames,
  tagNameToId,
}: {
  tagNames: string[] | undefined;
  tagNameToId: Map<string, string>;
}): string[] {
  if (!tagNames || tagNames.length === 0) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const name of tagNames) {
    const id = tagNameToId.get(name);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}
