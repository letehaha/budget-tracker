import type { Cents } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { executeImport } from '@services/import-export/csv-import/execute-import';
import { z } from 'zod';

import { accountMappingValueSchema, categoryMappingValueSchema, tagMappingValueSchema } from './shared-schemas';

const parsedTransactionRowSchema = z.object({
  rowIndex: z.number(),
  date: z.string(), // ISO format
  amount: z.number().transform((n) => n as Cents),
  description: z.string(),
  categoryName: z.string().optional(),
  tagNames: z.array(z.string()).optional(),
  accountName: z.string(),
  currencyCode: z.string(),
  transactionType: z.enum(['income', 'expense']),
});

export const executeImportController = createController(
  z.object({
    body: z.object({
      validRows: z.array(parsedTransactionRowSchema),
      accountMapping: z.record(z.string(), accountMappingValueSchema),
      categoryMapping: z.record(z.string(), categoryMappingValueSchema),
      tagMapping: z.record(z.string(), tagMappingValueSchema).optional(),
      skipDuplicateIndices: z.array(z.number()),
      skipUnpriceableIndices: z.array(z.number()).optional(),
      defaultAccountId: recordId().optional(),
      defaultCategoryId: recordId().optional(),
    }),
  }),
  async ({ user, body }) => {
    const {
      validRows,
      accountMapping,
      categoryMapping,
      tagMapping,
      skipDuplicateIndices,
      skipUnpriceableIndices,
      defaultAccountId,
      defaultCategoryId,
    } = body;

    const result = await executeImport({
      userId: user.id,
      validRows,
      accountMapping,
      categoryMapping,
      tagMapping,
      skipDuplicateIndices,
      skipUnpriceableIndices,
      defaultAccountId,
      defaultCategoryId,
    });

    return {
      data: result,
    };
  },
);
