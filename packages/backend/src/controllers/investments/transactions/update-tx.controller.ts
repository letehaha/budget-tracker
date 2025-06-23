import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateInvestmentTransaction } from '@services/investments/transactions/update.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      transactionId: recordId(),
    }),
    body: z.object({
      category: z.nativeEnum(INVESTMENT_TRANSACTION_CATEGORY).optional(),
      date: z.string().date().optional(),
      quantity: z.string().optional(),
      price: z.string().optional(),
      fees: z.string().optional(),
      name: z.string().optional(),
    }),
  }),
  async ({ user, params, body }) => {
    const transaction = await updateInvestmentTransaction({
      userId: user.id,
      transactionId: params.transactionId,
      ...body,
    });
    return { data: transaction };
  },
);
