import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransactionGroup } from '@root/serializers/transaction-groups.serializer';
import * as transactionGroupsService from '@services/transaction-groups';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters').trim().optional(),
    note: z.string().max(500, 'Note must not exceed 500 characters').nullish(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const result = await transactionGroupsService.updateTransactionGroup({
    id: params.id,
    userId: user.id,
    name: body.name,
    note: body.note,
  });

  return { data: serializeTransactionGroup(result) };
});
