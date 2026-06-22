/**
 * Pure helpers for the Map step's transaction-type coverage check.
 *
 * When the transaction type is read "from a column", every distinct value in that
 * column must be assigned to either the income or the expense list. These helpers
 * compute the distinct values over the FULL data set (not just the preview, which
 * can miss values that first appear in later rows — common when several files are
 * merged) and report which are still unassigned, so the wizard can block Next on
 * the Map step instead of failing later server-side.
 *
 * Matching mirrors the backend (`validate-transaction-type.ts`): values are
 * trimmed, empty cells ignored, and coverage is an exact, case-sensitive membership
 * test against the income/expense lists.
 */

/** Distinct, trimmed, non-empty values of `columnName` across `dataRows`, in first-seen order. */
export function distinctColumnValues({
  headers,
  dataRows,
  columnName,
}: {
  headers: string[];
  dataRows: string[][];
  columnName: string;
}): string[] {
  const index = headers.indexOf(columnName);
  if (index === -1) return [];

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of dataRows) {
    const value = row[index]?.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  }
  return ordered;
}

/** Values not present in either the income or expense list (exact, case-sensitive). */
export function findUncoveredValues({
  values,
  incomeValues,
  expenseValues,
}: {
  values: string[];
  incomeValues: string[];
  expenseValues: string[];
}): string[] {
  const covered = new Set<string>([...incomeValues, ...expenseValues]);
  return values.filter((value) => !covered.has(value));
}
