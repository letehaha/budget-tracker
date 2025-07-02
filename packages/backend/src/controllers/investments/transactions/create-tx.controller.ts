import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createInvestmentTransaction } from '@services/investments/transactions/create.service';
import { z } from 'zod';

export default createController(
  z.object({
    body: z.object({
      portfolioId: recordId(),
      securityId: recordId(),
      category: z.nativeEnum(INVESTMENT_TRANSACTION_CATEGORY),
      date: z.string().date(),
      quantity: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
        message: 'Quantity must be a positive number',
      }),
      price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
        message: 'Price must be a positive number',
      }),
      fees: z
        .string()
        .optional()
        .default('0')
        .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
          message: 'Fees must be a non-negative number',
        }),
      name: z.string().optional(),
    }),
  }),
  async ({ user, body }) => {
    const tx = await createInvestmentTransaction({ userId: user.id, ...body });
    return { data: tx, statusCode: 201 };
  },
);
