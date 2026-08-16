/** The decimal mark a whole Register.csv is written with. */
type YnabDecimalSeparator = '.' | ',';

/** Spacing marks used as thousands separators: plain, non-breaking and thin spaces, and the Swiss apostrophe. */
const GROUPING_WHITESPACE = /[\s   ']/g;

/**
 * Strips currency decoration and returns the bare digits-and-separators run
 * plus its sign, or null when the cell holds no usable number.
 *
 * A sign is only honoured when it sits before the first digit, so both
 * `-$5.00` and `$-5.00` read as negative.
 */
function extractNumericToken({ raw }: { raw: string }): { token: string; negative: boolean } | null {
  const compact = raw.replace(GROUPING_WHITESPACE, '');

  const firstDigit = compact.search(/\d/);
  if (firstDigit === -1) return null;
  const lastDigit = compact.replace(/\D+$/, '').length - 1;

  let start = firstDigit;
  while (start > 0 && (compact[start - 1] === '.' || compact[start - 1] === ',')) start -= 1;

  const token = compact.slice(start, lastDigit + 1);
  if (!/^[\d.,]+$/.test(token)) return null;

  return { token, negative: compact.slice(0, firstDigit).includes('-') };
}

/**
 * Resolves which mark is the decimal point across a whole Register.csv.
 *
 * One YNAB budget has one currency format, so the answer is file-wide. YNAB
 * pads decimals on every row (`0.00` / `0,00`), which is what makes a decisive
 * signal near-certain; zero-decimal currencies like JPY leave no signal at all
 * and fall back to a dot, under which their lone comma reads as grouping.
 */
export function detectYnabDecimalSeparator({
  values,
}: {
  values: (string | null | undefined)[];
}): YnabDecimalSeparator {
  let dotVotes = 0;
  let commaVotes = 0;

  for (const value of values) {
    if (value === null || value === undefined) continue;
    const extracted = extractNumericToken({ raw: value });
    if (!extracted) continue;

    const { token } = extracted;
    const lastDot = token.lastIndexOf('.');
    const lastComma = token.lastIndexOf(',');

    if (lastDot >= 0 && lastComma >= 0) {
      if (lastDot > lastComma) dotVotes += 1;
      else commaVotes += 1;
      continue;
    }
    if (lastDot < 0 && lastComma < 0) continue;

    const separator = lastDot >= 0 ? '.' : ',';
    const separatorIndex = lastDot >= 0 ? lastDot : lastComma;
    const occurrences = token.split(separator).length - 1;

    if (occurrences > 1) {
      // Repeated marks can only be grouping, which makes the other mark decimal.
      if (separator === '.') commaVotes += 1;
      else dotVotes += 1;
      continue;
    }

    const digitsAfter = token.length - separatorIndex - 1;
    if (digitsAfter === 1 || digitsAfter === 2) {
      if (separator === '.') dotVotes += 1;
      else commaVotes += 1;
    }
  }

  return commaVotes > dotVotes ? ',' : '.';
}

/**
 * Parse a YNAB amount cell ("$1234.56", "₹0.00", "", "€1.234,56", "1 234,56 kr").
 *
 * YNAB writes amounts in the budget's currency format: the symbol may lead or
 * trail, the decimal mark is a dot or a comma, and grouping is not always in
 * threes (Indian lakh writes `1,23,456.78`). `decimalSeparator` comes from
 * `detectYnabDecimalSeparator` over the whole file, so grouping marks can be
 * dropped without re-guessing per cell.
 *
 * Returns null when the input cannot be parsed into a finite number — caller
 * decides whether that becomes a warning or a hard failure.
 */
export function parseYnabAmount({
  raw,
  decimalSeparator,
}: {
  raw: string | null | undefined;
  decimalSeparator: YnabDecimalSeparator;
}): number | null {
  if (raw === null || raw === undefined) return null;
  const extracted = extractNumericToken({ raw: raw.trim() });
  if (!extracted) return null;

  const groupingSeparator = decimalSeparator === '.' ? ',' : '.';
  let body = extracted.token;

  const decimalIndex = body.lastIndexOf(decimalSeparator);
  const groupingIndex = body.lastIndexOf(groupingSeparator);
  if (decimalIndex >= 0 && groupingIndex > decimalIndex) return null;
  body = body.split(groupingSeparator).join('');

  if (body.split(decimalSeparator).length - 1 > 1) return null;

  const normalized = body.replace(decimalSeparator, '.');
  if (!/^\d*\.?\d+$/.test(normalized)) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;

  return extracted.negative && amount !== 0 ? -amount : amount;
}
