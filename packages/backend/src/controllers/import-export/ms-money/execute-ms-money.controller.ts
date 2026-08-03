import type { ExecuteMsMoneyResponse } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { queueMsMoneyImport } from '@services/import-export/ms-money-import';
import { z } from 'zod';

import { categoryMappingValueSchema, importExecuteRequestBaseSchema } from '../shared-schemas';
import { msMoneyAccountMappingSchema, msMoneyUploadIdSchema } from './shared-schemas';

export const executeMsMoneyController = createController(
  z.object({
    body: z.object({
      uploadId: msMoneyUploadIdSchema,
      accountMapping: msMoneyAccountMappingSchema,
      // Per-category decision keyed by the category's full path in the Money file
      // ("Auto:Gas" for a leaf, "Auto" for a group). Same value schema as the CSV
      // import. A category left out of the map imports without a category.
      categoryMapping: z.record(z.string(), categoryMappingValueSchema),
      // Row indices that were detected as duplicates and confirmed to skip. An
      // empty array means the user chose to import everything. Row indices are
      // non-negative integers, so reject fractional / negative noise at the edge.
      skipDuplicateIndices: z.array(z.number().int().nonnegative()),
      // Rows Money marks void carry a real amount but never moved money. Opting
      // in writes them as zero-amount transactions tagged "Void".
      includeVoidedTransactions: z.boolean().optional(),
      // Shared balance-recalculation fields (`recalculateBalance`), tied to
      // `ImportExecuteRequestBase` by a drift guard in `../shared-schemas`.
      ...importExecuteRequestBaseSchema.shape,
    }),
  }),
  async ({ user, body }) => {
    const {
      uploadId,
      accountMapping,
      categoryMapping,
      skipDuplicateIndices,
      includeVoidedTransactions,
      recalculateBalance,
    } = body;
    const jobId = await queueMsMoneyImport({
      userId: user.id,
      uploadId,
      accountMapping,
      categoryMapping,
      skipDuplicateIndices,
      includeVoidedTransactions,
      recalculateBalance,
    });
    const data: ExecuteMsMoneyResponse = { jobId };
    return { data };
  },
);
