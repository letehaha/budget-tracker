import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { executeImport } from '@services/import-export/statement-parser/execute-import.service';
import { z } from 'zod';

const extractedTransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  type: z.enum(['income', 'expense']),
});

/**
 * Execute statement import - create transactions in the database
 *
 * Creates transactions in the specified account from extracted statement data.
 * Best-effort: each transaction is persisted independently, so a row that fails
 * is reported in `summary.errors` while the rest are still imported.
 */
export const executeImportController = createController(
  z.object({
    body: z.object({
      /** Account ID to import transactions to */
      accountId: recordId(),
      /** Extracted transactions to import */
      transactions: z.array(extractedTransactionSchema),
      /** Transaction indices to skip (confirmed duplicates) */
      skipIndices: z.array(z.number().int().nonnegative()),
    }),
  }),
  async ({ user, body }) => {
    const { accountId, transactions, skipIndices } = body;

    const result = await executeImport({
      userId: user.id,
      accountId,
      transactions,
      skipIndices,
    });

    return {
      data: result,
    };
  },
);
