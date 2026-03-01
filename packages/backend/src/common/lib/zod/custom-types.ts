import { Money } from '@common/types/money';
import { z } from 'zod';

export const recordId = () => z.coerce.number().int().positive().finite();
export const recordArrayIds = () => z.array(recordId());

/**
 * Zod type for decimal monetary amounts from API requests.
 * Accepts a finite number and transforms it directly into a Money instance,
 * eliminating the need to call Money.fromDecimal() manually in controllers.
 *
 * @example
 * body: z.object({
 *   amount: decimalMoney(),           // Money instance, any value
 *   fee: decimalMoney().optional(),   // optional Money instance
 * })
 */
export const decimalMoney = () => z.number().transform((val) => Money.fromDecimal(val));
export const currencyCode = () => z.string().length(3);

/**
 * Used for the case when array is expected to be received like 1,2,3.
 * For example GET queries
 */
export const commaSeparatedRecordIds = z.string().transform((str, ctx) => {
  const idSchema = recordId();
  const ids = str.split(',').map((id) => {
    const result = idSchema.safeParse(id);
    return result.success ? result.data : null;
  });

  if (ids.some((id) => id === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Not all values are valid record IDs',
    });
    return z.NEVER;
  }
  return ids as number[];
});

/**
 * Properly handles boolean query parameters from URL strings.
 * Converts "true", "1" to true and "false", "0" to false.
 * Rejects other string values.
 */
export const booleanQuery = () =>
  z.union([z.boolean(), z.string()]).transform((val, ctx) => {
    if (typeof val === 'boolean') {
      return val;
    }

    const lowerVal = val.toLowerCase();
    if (lowerVal === 'true' || lowerVal === '1') {
      return true;
    }
    if (lowerVal === 'false' || lowerVal === '0') {
      return false;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Boolean value must be "true", "false", "1", or "0"',
    });
    return z.NEVER;
  });

/** Validates a YYYY-MM-DD date string. */
export const dateString = () =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' });

/** Validates a positive decimal amount string (rejects zero and negative by default). */
export const positiveAmountString = () =>
  z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: 'Amount must be a valid number greater than 0',
  });

export const numericString = (options?: { allowNegative?: boolean; allowZero?: boolean }) =>
  z
    .union([z.string(), z.number()])
    .refine(
      (val) => {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return false;
        if (!options?.allowZero && num === 0) return false;
        if (!options?.allowNegative && num < 0) return false;
        return true;
      },
      {
        message: 'Invalid number format',
      },
    )
    .transform((val) => String(val));
