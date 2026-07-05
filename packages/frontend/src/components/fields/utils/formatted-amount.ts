/**
 * Helpers behind `formatted-amount-field.vue`: parse typed text into a numeric
 * value + display fragment, and keep the caret anchored through reformatting.
 * All parsing uses a canonical '.'; the component normalizes locale separators in/out.
 */

export interface AmountSeparators {
  decimal: string;
  group: string;
}

/** Resolves the runtime locale's number separators so typing and display agree. */
export const getAmountSeparators = (): AmountSeparators => {
  const parts = new Intl.NumberFormat(undefined).formatToParts(12345.6);
  return {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
  };
};

/**
 * Splits typed input into a numeric value + fragment (the decimal tail a Number
 * round-trip would lose, e.g. "1234." or "2.00"). Decimals cap at 2 digits — extra
 * typed precision is dropped rather than letting model and display diverge.
 *
 * `groupSeparator`, when given, is stripped before the decimal separator gets
 * canonicalized to '.'. This matters for locales (de-DE, es-ES, ...) whose
 * group separator IS '.' — without stripping it first, canonicalizing the
 * decimal separator produces a string with two dots and the "collapse extra
 * dots" step below keeps the wrong one, truncating the value (e.g. typed
 * "1.234,56" would parse as 1.23 instead of 1234.56).
 */
export const parseAmountInput = ({
  raw,
  decimalSeparator,
  groupSeparator = '',
}: {
  raw: string;
  decimalSeparator: string;
  groupSeparator?: string;
}): { fragment: string; numeric: number | null } => {
  const withoutGroups = groupSeparator ? raw.split(groupSeparator).join('') : raw;
  const canonical = decimalSeparator === '.' ? withoutGroups : withoutGroups.split(decimalSeparator).join('.');
  const stripped = canonical.replace(/[^\d.]/g, '');
  const firstDot = stripped.indexOf('.');
  // Collapse any extra decimal points after the first — pasting "1.2.3" lands on "1.23".
  const collapsed =
    firstDot === -1 ? stripped : stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '');

  if (collapsed === '' || collapsed === '.') return { fragment: '', numeric: null };

  const hasDot = collapsed.includes('.');
  const [intPart = '', decRaw = ''] = collapsed.split('.');
  const decimals = decRaw.slice(0, 2);
  const normalized = hasDot ? `${intPart}.${decimals}` : intPart;

  let fragment = '';
  if (hasDot) {
    if (decimals === '') {
      fragment = '.';
    } else {
      const significant = decimals.replace(/0+$/, '');
      if (significant === '') {
        // All-zero decimals ("2.00"): the numeric value drops the dot too.
        fragment = `.${decimals}`;
      } else if (significant.length < decimals.length) {
        fragment = decimals.slice(significant.length);
      }
    }
  }

  const numeric = Number(normalized);
  return { fragment, numeric: Number.isNaN(numeric) ? null : numeric };
};

const isCaretAnchorChar = ({ char, decimalSeparator }: { char: string; decimalSeparator: string }): boolean =>
  /\d/.test(char) || char === decimalSeparator || char === '.';

/**
 * Counts digits/decimal points at or before `caret`. Anchors the cursor after
 * reformatting so mid-number typing stays stable when group separators shift.
 */
export const countDigitsBeforeCaret = ({
  text,
  caret,
  decimalSeparator,
}: {
  text: string;
  caret: number;
  decimalSeparator: string;
}): number => {
  let count = 0;
  for (let i = 0; i < caret && i < text.length; i += 1) {
    if (isCaretAnchorChar({ char: text[i]!, decimalSeparator })) count += 1;
  }
  return count;
};

/** Offset just past the `digitCount`-th anchor char — the same digit the user was on before reformatting. */
export const caretOffsetAfterDigits = ({
  text,
  digitCount,
  decimalSeparator,
}: {
  text: string;
  digitCount: number;
  decimalSeparator: string;
}): number => {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (isCaretAnchorChar({ char: text[i]!, decimalSeparator })) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return text.length;
};
