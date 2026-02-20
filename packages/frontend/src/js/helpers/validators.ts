export const amount = (value: number | string): boolean => Number.isFinite(value) && Number(value) > 0;
export const maxDecimalPoints =
  (points: number | string) =>
  (value: number | string): boolean => {
    const number = parseFloat(String(value));

    if (!Number.isFinite(number)) return false;

    // Use toFixed to convert to plain decimal notation (avoids "1e-7" scientific notation)
    const decimalStr = number.toFixed(20).replace(/\.?0+$/, '');
    const parts = decimalStr.split('.');
    if (parts.length < 2) return true;
    return parts[1]!.length <= Number(points);
  };

/** Validates that a monetary value has at most 2 decimal places (standard currency precision). */
export const currencyDecimal = maxDecimalPoints(2);
export const requiredToBeTrue = (value: unknown): boolean => value === true;

export * from '@vuelidate/validators';
