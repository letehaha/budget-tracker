import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteInvestmentTransaction } from '@services/investments/transactions/delete.service';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      transactionId: recordId(),
    }),
  }),
  async ({ user, params }) => {
    await deleteInvestmentTransaction({ userId: user.id, transactionId: params.transactionId });
    return { statusCode: 200 };
  },
);
