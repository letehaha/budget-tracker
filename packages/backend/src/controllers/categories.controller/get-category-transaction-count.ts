import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import Transactions from '@models/Transactions.model';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { id: userId } = user;
  const { id: categoryId } = params;

  const transactionCount = await Transactions.count({
    where: {
      userId,
      categoryId,
    },
  });

  return { data: { transactionCount } };
});
