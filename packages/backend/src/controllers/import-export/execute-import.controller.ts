import type { Cents } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { executeImport } from '@services/import-export/csv-import/execute-import';
import { z } from 'zod';

const parsedTransactionRowSchema = z.object({
  rowIndex: z.number(),
  date: z.string(), // ISO format
  amount: z.number().transform((n) => n as Cents),
  description: z.string(),
  categoryName: z.string().optional(),
  accountName: z.string(),
  currencyCode: z.string(),
  transactionType: z.enum(['income', 'expense']),
});

const accountMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), accountId: z.number() }),
]);

const categoryMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), categoryId: z.number() }),
]);

export const executeImportController = createController(
  z.object({
    body: z.object({
      validRows: z.array(parsedTransactionRowSchema),
      accountMapping: z.record(z.string(), accountMappingValueSchema),
      categoryMapping: z.record(z.string(), categoryMappingValueSchema),
      skipDuplicateIndices: z.array(z.number()),
    }),
  }),
  async ({ user, body }) => {
    const { validRows, accountMapping, categoryMapping, skipDuplicateIndices } = body;

    const result = await executeImport({
      userId: user.id,
      validRows,
      accountMapping,
      categoryMapping,
      skipDuplicateIndices,
    });

    return {
      data: result,
    };
  },
);
