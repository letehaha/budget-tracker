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
      quantity: z.string(),
      price: z.string(),
      fees: z.string().optional().default('0'),
      name: z.string().optional(),
    }),
  }),
  async ({ user, body }) => {
    const tx = await createInvestmentTransaction({ userId: user.id, ...body });
    return { data: tx, statusCode: 201 };
  },
);
