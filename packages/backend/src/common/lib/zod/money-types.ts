import { Money } from '@common/types/money';
import { z } from 'zod';

import { numericString } from './custom-types';

/**
 * Zod schema for decimal money amounts from API request bodies.
 * Accepts a finite number and transforms it into a Money instance.
 *
 * @example
 * const schema = z.object({ amount: moneyAmount() });
 * // Input:  { amount: 15.50 }
 * // Output: { amount: Money.fromDecimal(15.50) }
 */
export const moneyAmount = () =>
  z
    .number()
    .finite()
    .transform((v) => Money.fromDecimal(v));

/**
 * Zod schema for numeric string money amounts (used in investment endpoints).
 * Accepts a string or number, validates it as numeric, then transforms to Money.
 *
 * @example
 * const schema = z.object({ quantity: moneyFromString() });
 * // Input:  { quantity: "102.5000000000" }
 * // Output: { quantity: Money.fromDecimal("102.5000000000") }
 */
export const moneyFromString = (options?: { allowNegative?: boolean; allowZero?: boolean }) =>
  numericString(options).transform((v) => Money.fromDecimal(v));
