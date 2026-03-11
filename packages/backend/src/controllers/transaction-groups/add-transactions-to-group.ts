import { recordId, uniqueRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransactionGroup } from '@root/serializers/transaction-groups.serializer';
import * as transactionGroupsService from '@services/transaction-groups';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    transactionIds: uniqueRecordIds({ min: 1 }),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const result = await transactionGroupsService.addTransactionsToGroup({
    groupId: params.id,
    userId: user.id,
    transactionIds: body.transactionIds,
  });

  return { data: serializeTransactionGroup(result) };
});
