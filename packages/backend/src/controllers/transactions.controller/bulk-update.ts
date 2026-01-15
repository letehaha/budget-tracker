import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as transactionsService from '@services/transactions/bulk-update';
import { z } from 'zod';

const tagModeSchema = z.enum(['add', 'replace', 'remove']);

const bodyZodSchema = z
  .object({
    transactionIds: z.array(recordId()).min(1, 'At least one transaction ID required'),
    categoryId: recordId().optional(),
    tagIds: z.array(recordId()).max(20, 'Maximum 20 tags allowed').optional(),
    tagMode: tagModeSchema.optional(),
    note: z.string().max(1000, 'Note must not exceed 1000 characters').optional(),
  })
  .refine((data) => data.categoryId !== undefined || data.tagIds !== undefined || data.note !== undefined, {
    message: 'At least one field (categoryId, tagIds, or note) must be provided',
  });

const schema = z.object({
  body: bodyZodSchema,
});

export default createController(schema, async ({ user, body }) => {
  const { transactionIds, categoryId, tagIds, tagMode, note } = body;
  const { id: userId } = user;

  const result = await transactionsService.bulkUpdate({
    userId,
    transactionIds,
    categoryId,
    tagIds,
    tagMode,
    note,
  });

  return { data: result };
});
