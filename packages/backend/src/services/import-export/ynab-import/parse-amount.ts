/**
 * Parse a YNAB amount cell ("$1234.56", "$0.00", "", "$1,234.56").
 *
 * YNAB uniformly prefixes every amount with `$` regardless of the account's
 * actual currency (the currency lives in the account name, not the amount
 * column). Strip the `$`, strip any thousands separators, then parse.
 *
 * Returns null when the input cannot be parsed into a finite number — caller
 * decides whether that becomes a warning or a hard failure.
 */
export function parseYnabAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const stripped = trimmed.replace(/[$\s,]/g, '');
  if (stripped === '' || stripped === '-' || stripped === '+') return null;

  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  return n;
}
