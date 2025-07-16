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
      quantity: z
        .string()
        .optional()
        .refine((val) => val === undefined || (!isNaN(parseFloat(val)) && parseFloat(val) > 0), {
          message: 'Quantity must be a positive number',
        }),
      price: z
        .string()
        .optional()
        .refine((val) => val === undefined || (!isNaN(parseFloat(val)) && parseFloat(val) > 0), {
          message: 'Price must be a positive number',
        }),
      fees: z
        .string()
        .optional()
        .refine((val) => val === undefined || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
          message: 'Fees must be a non-negative number',
        }),
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
