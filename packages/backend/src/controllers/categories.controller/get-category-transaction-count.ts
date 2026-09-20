import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { countCategoryTransactions } from '@services/categories/count-category-transactions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { id: userId } = user;
  const { id: categoryId } = params;

  const transactionCount = await countCategoryTransactions({ categoryId, userId });

  return { data: { transactionCount } };
});
