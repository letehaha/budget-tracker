import { currencyCode, decimalString, recordId } from '@common/lib/zod/custom-types';
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
        currencyCode: currencyCode(),
        availableCashDelta: decimalString().optional(),
        totalCashDelta: decimalString().optional(),
        setAvailableCash: decimalString().optional(),
        setTotalCash: decimalString().optional(),
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
      )
      .refine(
        (data) => {
          const hasDelta = data.availableCashDelta !== undefined || data.totalCashDelta !== undefined;
          const hasSet = data.setAvailableCash !== undefined || data.setTotalCash !== undefined;
          return !(hasDelta && hasSet);
        },
        {
          message: 'Delta fields and set fields cannot be combined in the same request',
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
