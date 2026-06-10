/**
 * Pure helpers behind `formatted-amount-field.vue`: parsing the user's typed
 * text into a numeric model value plus a display-only "fragment", and keeping
 * the caret anchored while thousand separators get redistributed around it.
 *
 * All parsing works on a canonical '.' decimal separator; the locale-specific
 * separator is normalized on the way in and re-applied by the component on the
 * way out.
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
 * Parses raw typed input into (numeric value, display fragment). The fragment
 * is the tail of the typed decimals that a `Number` round-trip loses — a
 * trailing decimal point ("1234." → '.') or trailing zeros ("1.50" → '0',
 * "2.00" → '.00') — preserved so mid-typing keystrokes don't visually vanish.
 * Decimals are capped at 2 digits: extra typed precision is ignored instead of
 * letting the model and the 2-digit display diverge.
 */
export const parseAmountInput = ({
  raw,
  decimalSeparator,
}: {
  raw: string;
  decimalSeparator: string;
}): { fragment: string; numeric: number | null } => {
  // Canonicalize the locale decimal separator, then drop everything that isn't
  // a digit or a decimal point (group separators, currency symbols, letters).
  const canonical = decimalSeparator === '.' ? raw : raw.split(decimalSeparator).join('.');
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
 * Counts how many digits (and decimal points) sit at or before `caret` in the
 * displayed string. Used to anchor the cursor after reformatting — keeps
 * "12,3|45" stable when the user types in the middle of the number and the
 * group separators get redistributed.
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

/**
 * Walks the freshly formatted string and returns the offset just past the
 * `digitCount`-th anchor character — i.e. right after the same digit the user
 * was on before the reformat.
 */
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
