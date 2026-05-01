import { currencyCode, dateString, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { detectCashFlowDuplicates } from '@services/import-export/portfolio-cash-flow-import';
import { z } from 'zod';

const MAX_ROWS = 1000;

const cashFlowRowSchema = z.object({
  date: dateString(),
  amount: z.number().positive().finite(),
  currencyCode: currencyCode(),
  direction: z.enum(['deposit', 'withdrawal']),
  sourceLine: z.string().max(2_000).optional(),
  description: z.string().max(2_000).optional(),
});

export const detectCashFlowDuplicatesController = createController(
  z.object({
    body: z.object({
      portfolioId: recordId(),
      rows: z.array(cashFlowRowSchema).max(MAX_ROWS),
    }),
  }),
  async ({ user, body }) => {
    const duplicates = await detectCashFlowDuplicates({
      userId: user.id,
      portfolioId: body.portfolioId,
      rows: body.rows,
    });

    return { data: { duplicates } };
  },
);
