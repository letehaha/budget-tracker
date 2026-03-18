import { uniqueRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransactionGroup } from '@root/serializers/transaction-groups.serializer';
import * as transactionGroupsService from '@services/transaction-groups';
import z from 'zod';

const schema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters').trim(),
    note: z.string().max(500, 'Note must not exceed 500 characters').nullish(),
    transactionIds: uniqueRecordIds({ min: 2, max: 50 }),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const result = await transactionGroupsService.createTransactionGroup({
    userId: user.id,
    name: body.name,
    note: body.note ?? null,
    transactionIds: body.transactionIds,
  });

  return { data: serializeTransactionGroup(result) };
});
