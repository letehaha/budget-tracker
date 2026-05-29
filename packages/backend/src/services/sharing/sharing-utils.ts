/**
 * Coerces a string-or-number that is expected to encode a positive integer (e.g.
 * `ResourceShares.resourceId` — VARCHAR carrying an account id or owner user id) into a
 * `number`. Returns `null` when the value isn't a finite positive integer.
 *
 * Centralized here because the same shape-check is repeated across the sharing services
 * and would otherwise drift (some sites used `Number.isInteger`, some `Number.isFinite`,
 * some allowed zero).
 */
export const toPositiveInt = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Display label for a household membership. Centralizes the "X's household" phrasing so
 * notification titles, member lists, and emails stay in sync.
 */
export const formatHouseholdLabel = (ownerDisplayName: string): string => `${ownerDisplayName}'s household`;
