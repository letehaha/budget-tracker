import type { RecordId } from '@bt/shared/types';

export interface SelectedPayee {
  id: RecordId;
  name: string;
  logoDomain: string | null;
}

export interface PayeeLookupEntry {
  name: string;
  logoDomain: string | null;
}

/**
 * Refresh the display name/logo of each already-selected payee from a freshly
 * resolved lookup. Two lookups feed this: the search list the dropdown fetches
 * while open, and the by-id resolver that hydrates a saved view's selection
 * before the dropdown is ever opened (without it a restored single payee shows
 * its raw id until first open). Rows the lookup can't resolve — and rows whose
 * name and logo are unchanged — keep their existing object identity so Vue skips
 * needless re-renders.
 */
export const hydrateSelectedPayees = ({
  selected,
  lookup,
}: {
  selected: SelectedPayee[];
  lookup: Map<string, PayeeLookupEntry>;
}): SelectedPayee[] =>
  selected.map((sel) => {
    const fresh = lookup.get(sel.id);
    if (!fresh) return sel;
    const nextLogo = fresh.logoDomain ?? null;
    if (fresh.name === sel.name && nextLogo === sel.logoDomain) return sel;
    return { id: sel.id, name: fresh.name, logoDomain: nextLogo };
  });
