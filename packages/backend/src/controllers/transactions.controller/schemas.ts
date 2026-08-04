import { recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

// Amount fields carry decimals (e.g. 100.50); callers convert them to cents after validation.

// Zero is allowed: a register entry can exist without ever moving money (a
// Microsoft Money voided cheque), and such rows must stay editable.
export const nonNegativeAmountSchema = () => z.number().nonnegative('Amount must be 0 or greater').finite();

// For amounts that carry no meaning at zero: a transfer leg that moves nothing,
// a fee that costs nothing, a split that holds no share of its parent.
export const positiveAmountSchema = () => z.number().positive('Amount must be greater than 0').finite();

export const splitSchema = z.object({
  categoryId: recordId(),
  amount: positiveAmountSchema(),
  note: z.string().max(100, 'Split note must not exceed 100 characters').nullish(),
});
