/**
 * Parse date string and return ISO format (YYYY-MM-DD)
 * Supports multiple common date formats
 */
export function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (isValidDate(Number(year), Number(month), Number(day))) {
      return `${year}-${month}-${day}`;
    }
  }

  // Try US format (MM/DD/YYYY or MM-DD-YYYY)
  const usMatch = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    if (isValidDate(Number(year), Number(month), Number(day))) {
      return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
    }
  }

  // Try European format (DD/MM/YYYY or DD.MM.YYYY)
  const euMatch = dateStr.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    if (isValidDate(Number(year), Number(month), Number(day))) {
      return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
    }
  }

  // Try parsing with Date constructor as fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    // Validate reasonable date range (1900 to current year + 1)
    const currentYear = new Date().getFullYear();
    if (year >= 1900 && year <= currentYear + 1) {
      return `${year}-${month}-${day}`;
    }
  }

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
