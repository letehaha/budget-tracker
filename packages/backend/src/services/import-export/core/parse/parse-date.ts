/**
 * Parse date string and return ISO format (YYYY-MM-DD)
 * Supports multiple common date formats
 */
export function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Try ISO and ISO-like formats (year-first): YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD.
  // Brokers commonly emit YYYY/MM/DD on the trade-date column; without this
  // pattern we'd drop every row in their exports.
  const isoMatch = dateStr.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (isValidDate(Number(year), Number(month), Number(day))) {
      return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
    }
  }

  // Compact 8-digit YYYYMMDD (e.g. "20250131" from Yahoo Finance exports).
  const compactMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    if (isValidDate(Number(year), Number(month), Number(day))) {
      return `${year}-${month}-${day}`;
    }
  }

  // Day-first vs month-first slash/dash/dot format. Both regexes match the same
  // strings — when only one interpretation is a valid calendar date (e.g.
  // 15/03/2024 → can't be month 15), we use that one. When BOTH could be valid
  // (e.g. 01/02/2024 — could be Jan 2 US or Feb 1 EU), we tie-break to US
  // because every broker we've shipped support for so far has been US-format.
  // This documented behaviour is locked in by parse-date.unit.ts.
  const slashOrDashMatch = dateStr.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slashOrDashMatch) {
    const [, a, b, yearStr] = slashOrDashMatch;
    const year = Number(yearStr);
    const usValid = isValidDate(year, Number(a), Number(b));
    const euValid = isValidDate(year, Number(b), Number(a));
    if (usValid) {
      // Tie-break: when both interpretations parse, prefer US.
      return `${yearStr}-${a!.padStart(2, '0')}-${b!.padStart(2, '0')}`;
    }
    if (euValid) {
      return `${yearStr}-${b!.padStart(2, '0')}-${a!.padStart(2, '0')}`;
    }
  }

  // No `new Date()` fallback. Its silent roll-over behaviour ("2024-01-32" →
  // Feb 1) is worse than returning null — a missed row is visible in the
  // invalid-rows warning, a wrong date is invisible. Brokers emit one of the
  // formats above; anything else should fail loudly.
  return null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const currentYear = new Date().getFullYear();

  // Basic range checks
  if (year < 1900 || year > currentYear + 1) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Check days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return false;

  return true;
}
