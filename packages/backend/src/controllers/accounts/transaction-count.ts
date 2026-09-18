import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getAccountTransactionCount } from '@services/accounts/transaction-count';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const transactionCount = await getAccountTransactionCount({ userId: user.id, accountId: params.id });

  return { data: { transactionCount } };
});
