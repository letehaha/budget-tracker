import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { detectDuplicates } from '@services/import-export/statement-parser/detect-duplicates.service';
import { z } from 'zod';

const extractedTransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  type: z.enum(['income', 'expense']),
});

/**
 * Detect duplicate transactions for statement import
 *
 * Compares extracted transactions against existing transactions in the specified account.
 * Uses date + amount + type matching (no description matching due to bank format differences).
 */
export const detectDuplicatesController = createController(
  z.object({
    body: z.object({
      /** Account ID to check duplicates against */
      accountId: recordId(),
      /** Extracted transactions from AI */
      transactions: z.array(extractedTransactionSchema),
    }),
  }),
  async ({ user, body }) => {
    const { accountId, transactions } = body;

    const duplicates = await detectDuplicates({
      userId: user.id,
      accountId,
      transactions,
    });

    return {
      data: {
        duplicates,
      },
    };
  },
);
