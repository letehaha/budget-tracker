import { createController } from '@controllers/helpers/controller-factory';
import { createPortfolioTransfer } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.coerce.number(),
  }),
  body: z.object({
    toPortfolioId: z.number(),
    currencyId: z.number(),
    amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: 'Amount must be a valid number greater than 0',
    }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' }),
    description: z.string().nullable().optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const transfer = await createPortfolioTransfer({
    userId: user.id,
    fromPortfolioId: params.id,
    toPortfolioId: body.toPortfolioId,
    currencyId: body.currencyId,
    amount: body.amount,
    date: body.date,
    description: body.description || null,
  });

  return { data: transfer };
});
