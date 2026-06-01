/**
 * Drop trailing zeros (and an orphan trailing dot) from the fractional part of
 * a decimal string. Lets us turn a backend's fixed-scale string like
 * "-0.0004920000" into the human-readable "-0.000492".
 */
export const trimTrailingZeros = (value: string) => {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
};

/**
 * Whether `value` carries more digits past the decimal point than `maxDecimals`
 * — i.e. rounding to that precision for display would hide information.
 */
export const exceedsMaxDecimals = ({ value, maxDecimals }: { value: string; maxDecimals: number }) => {
  const trimmed = trimTrailingZeros(value);
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex === -1) return false;
  return trimmed.length - dotIndex - 1 > maxDecimals;
};
