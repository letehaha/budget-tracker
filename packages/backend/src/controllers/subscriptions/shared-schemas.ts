import { recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

export const matchingRuleSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('note'),
    operator: z.literal('contains_any'),
    value: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    field: z.literal('amount'),
    operator: z.literal('between'),
    value: z.object({ min: z.number().int(), max: z.number().int() }),
    currencyCode: z.string().length(3).optional(),
  }),
  z.object({
    field: z.literal('transactionType'),
    operator: z.literal('equals'),
    value: z.string(),
  }),
  z.object({
    field: z.literal('accountId'),
    operator: z.literal('equals'),
    value: recordId(),
  }),
]);
