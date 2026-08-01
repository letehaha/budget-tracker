/**
 * Reads a monetary amount written in any of the common conventions into a plain number.
 *
 * Sources disagree about which mark separates thousands and which marks the decimal:
 * `1,234.56`, `1.234,56`, `1 234,56` and `1'234.56` are the same amount. Almost all of
 * them can be told apart without guessing, so they are read rather than rejected.
 *
 * `Intl` is no help here: it formats a number for a known locale and has no parser, so it
 * answers "which marks does de-DE use" when the question is "which convention is this
 * token written in". The libraries in this space want the convention passed in for the
 * same reason. Once the convention is known the conversion is `Number()`, so the
 * inference below is the whole job.
 */

/** Spacing marks used as thousands separators: plain, non-breaking and thin spaces, and the Swiss apostrophe. */
const GROUPING_WHITESPACE = /[\s  ']/g;

/** A separator run of exactly three digits is a thousands group; anything else is not. */
const THOUSANDS_GROUP_SIZE = 3;

function digitsAfter({ value, separatorIndex }: { value: string; separatorIndex: number }): number {
  return value.length - separatorIndex - 1;
}

/**
 * Removes `separator` when every group it creates after the first is a thousands group.
 * Null when the groups are the wrong size, which means the mark was not a separator at
 * all and the whole token is malformed.
 */
function stripThousandsSeparator({ value, separator }: { value: string; separator: string }): string | null {
  const [first, ...rest] = value.split(separator);
  if (first === undefined) return null;

  const allGroupsWellFormed = rest.every((group) => group.length === THOUSANDS_GROUP_SIZE);

  return allGroupsWellFormed ? first + rest.join('') : null;
}

/**
 * Null when the text is not an amount, or when it is one of the few genuinely ambiguous
 * forms: a single separator followed by exactly three digits — `1,234` is 1234 to a US
 * bank and 1.234 to a European one, and the token alone cannot say which.
 */
export function parseDecimalAmount({ raw }: { raw: string }): number | null {
  const compact = raw.replace(GROUPING_WHITESPACE, '');

  // Digits and separators only: a currency symbol or a trailing unit means the model
  // wrote something other than a number, and cutting it off would invent an amount.
  if (!/^[\d.,]+$/.test(compact) || !/\d/.test(compact)) return null;

  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');

  let normalized: string | null;

  if (lastDot >= 0 && lastComma >= 0) {
    // Both marks present, so the later one is the decimal point and the other groups digits
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    const [whole, fraction] = splitOnLast({ value: compact, separator: decimalSeparator });
    const wholeDigits = stripThousandsSeparator({ value: whole, separator: thousandsSeparator });

    normalized = wholeDigits === null ? null : `${wholeDigits}.${fraction}`;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? '.' : ',';
    const separatorIndex = lastDot >= 0 ? lastDot : lastComma;
    const occurrences = compact.split(separator).length - 1;

    if (occurrences > 1) {
      // Repeated, so it can only be grouping digits
      normalized = stripThousandsSeparator({ value: compact, separator });
    } else if (digitsAfter({ value: compact, separatorIndex }) === THOUSANDS_GROUP_SIZE && separatorIndex > 0) {
      normalized = null;
    } else {
      normalized = compact.replace(separator, '.');
    }
  } else {
    normalized = compact;
  }

  if (normalized === null || !/^\d*\.?\d+$/.test(normalized)) return null;

  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function splitOnLast({ value, separator }: { value: string; separator: string }): [string, string] {
  const index = value.lastIndexOf(separator);
  return [value.slice(0, index), value.slice(index + 1)];
}
