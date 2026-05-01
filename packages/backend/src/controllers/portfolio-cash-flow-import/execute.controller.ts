import { currencyCode, dateString, positiveAmountString, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { executeCashFlowImport } from '@services/import-export/portfolio-cash-flow-import';
import { z } from 'zod';

const MAX_ROWS = 1000;

const executeRowSchema = z.object({
  date: dateString(),
  amount: positiveAmountString(),
  currencyCode: currencyCode(),
  direction: z.enum(['deposit', 'withdrawal']),
  isHistorical: z.boolean(),
  description: z.string().max(2_000).nullable().optional(),
});

export const executeCashFlowController = createController(
  z.object({
    body: z.object({
      portfolioId: recordId(),
      rows: z.array(executeRowSchema).min(1).max(MAX_ROWS),
    }),
  }),
  async ({ user, body }) => {
    const result = await executeCashFlowImport({
      userId: user.id,
      portfolioId: body.portfolioId,
      rows: body.rows,
    });

    return { data: result };
  },
);
