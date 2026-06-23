/**
 * Split a Wallet (BudgetBakers) `labels` cell into its distinct tag names.
 *
 * Wallet joins multiple labels on a single row with `, ` in the `labels` column
 * (e.g. `Maru, Ahorro`). The CSV's own delimiter is `;`, so the comma always
 * lives inside the cell and never breaks a column — splitting on `,` is safe and
 * a label can never itself contain a comma. A single-label cell yields one name;
 * an empty/blank cell yields none.
 *
 * Each name is trimmed; empty segments (e.g. a trailing comma) are dropped; and
 * duplicates within the same row are collapsed (first occurrence wins,
 * order-preserving) so a repeated label doesn't double-count or double-attach.
 */
export function parseBudgetBakersWalletLabels({ raw }: { raw: string | null | undefined }): string[] {
  if (raw === null || raw === undefined) return [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
