import { booleanQuery } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransactionGroups } from '@root/serializers/transaction-groups.serializer';
import * as transactionGroupsService from '@services/transaction-groups';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    includeTransactions: booleanQuery().optional(),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const result = await transactionGroupsService.getTransactionGroups({
    userId: user.id,
    includeTransactions: query.includeTransactions,
  });

  return { data: serializeTransactionGroups(result) };
});
