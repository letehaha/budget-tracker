import { createController } from '@controllers/helpers/controller-factory';
import { queueBudgetBakersWalletImport } from '@services/import-export/budget-bakers-wallet-import';
import { z } from 'zod';

import { categoryMappingValueSchema, importExecuteRequestBaseSchema } from '../shared-schemas';
import { budgetBakersWalletAccountMappingSchema } from './shared-schemas';

export const executeBudgetBakersWalletController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      accountMapping: budgetBakersWalletAccountMappingSchema,
      // Per-category decision keyed by the verbatim Wallet `category` value:
      // create-new or link-existing+categoryId (same value schema as CSV import).
      // The transfer-marker category is never sent here.
      categoryMapping: z.record(z.string(), categoryMappingValueSchema),
      // Row indices that were detected as duplicates and confirmed to skip.
      // An empty array means the user chose to import everything. Row indices are
      // non-negative integers, so reject fractional / negative noise at the edge.
      skipDuplicateIndices: z.array(z.number().int().nonnegative()),
      // Shared balance-recalculation fields (`recalculateBalance`), tied to
      // `ImportExecuteRequestBase` by a drift guard in `../shared-schemas`.
      ...importExecuteRequestBaseSchema.shape,
    }),
  }),
  async ({ user, body }) => {
    const { fileContent, accountMapping, categoryMapping, skipDuplicateIndices, recalculateBalance } = body;
    const jobId = await queueBudgetBakersWalletImport({
      userId: user.id,
      fileContent,
      accountMapping,
      categoryMapping,
      skipDuplicateIndices,
      recalculateBalance,
    });
    return { data: { jobId } };
  },
);
