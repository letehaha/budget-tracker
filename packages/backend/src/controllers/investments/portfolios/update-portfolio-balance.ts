import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
    body: z
      .object({
        currencyId: recordId(),
        availableCashDelta: z.string().optional(),
        totalCashDelta: z.string().optional(),
        setAvailableCash: z.string().optional(),
        setTotalCash: z.string().optional(),
      })
      .strict()
      .refine(
        (data) =>
          data.availableCashDelta !== undefined ||
          data.totalCashDelta !== undefined ||
          data.setAvailableCash !== undefined ||
          data.setTotalCash !== undefined,
        {
          message: 'At least one balance field must be provided',
        },
      ),
  }),
  async ({ user, params, body }) => {
    const result = await updatePortfolioBalance({
      userId: user.id,
      portfolioId: params.id,
      ...body,
    });

    return { data: result };
  },
);
