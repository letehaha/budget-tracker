const toTrimmedString = (val: unknown): string => (val == null ? '' : String(val).trim());

/** Finite numeric value strictly greater than zero. Accepts string or number. */
export const isPositiveDecimal = (val: unknown): boolean => {
  const n = Number(toTrimmedString(val));
  return Number.isFinite(n) && n > 0;
};

/** Canonical decimal string (optional sign, optional fractional part). */
export const isDecimal = (val: unknown): boolean => /^-?\d+(\.\d+)?$/.test(toTrimmedString(val));

/** YYYY-MM-DD date string. */
export const isValidDate = (val: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(toTrimmedString(val));
