import { commaSeparatedRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    ids: commaSeparatedRecordIds,
  }),
});

export default createController(schema, async ({ user, query }) => {
  const data = await transactionsService.getTransactionsByIds({
    userId: user.id,
    ids: query.ids,
  });

  return { data };
});
