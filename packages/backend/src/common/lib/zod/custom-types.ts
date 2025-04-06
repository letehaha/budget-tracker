import { z } from 'zod';

export const recordId = () => z.coerce.number().int().positive().finite();
export const recordArrayIds = () => z.array(recordId());

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
