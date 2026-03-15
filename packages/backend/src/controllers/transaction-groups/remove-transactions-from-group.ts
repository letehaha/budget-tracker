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
    force: z.boolean().optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const result = await transactionGroupsService.removeTransactionsFromGroup({
    groupId: params.id,
    userId: user.id,
    transactionIds: body.transactionIds,
    force: body.force,
  });

  return {
    data: {
      group: result.group ? serializeTransactionGroup(result.group) : null,
      dissolved: result.dissolved,
    },
  };
});
