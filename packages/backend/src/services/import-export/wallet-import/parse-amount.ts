/**
 * Parse a Wallet (BudgetBakers) amount cell into a plain number.
 *
 * Wallet exports amount as a plain positive decimal with a dot separator and
 * no thousands separator or currency symbol (e.g. "400", "8500", "2100.5").
 * Sign is carried by the `type` column (Expense/Income), not the amount —
 * this helper only converts the raw string to a non-negative number. The
 * caller applies the sign.
 *
 * Returns null when the input cannot be parsed into a finite non-negative
 * number — caller decides whether to warn and skip or hard-fail.
 */
export function parseWalletAmount({ raw }: { raw: string | null | undefined }): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  // Wallet amounts are always positive; a negative value signals a malformed
  // export row that we cannot safely interpret.
  if (n < 0) return null;
  return n;
}
