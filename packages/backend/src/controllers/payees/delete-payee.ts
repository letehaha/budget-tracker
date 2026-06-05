import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as payeesService from '@services/payees';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  query: z
    .object({
      ignoreFuture: z
        .union([z.literal('true'), z.literal('false'), z.boolean()])
        .optional()
        .transform((v) => v === true || v === 'true'),
    })
    .optional(),
});

export default createController(schema, async ({ user, params, query }) => {
  if (query?.ignoreFuture) {
    const result = await payeesService.deletePayeeAndIgnoreFuture({
      userId: user.id,
      payeeId: params.id,
    });
    return { data: { ignoredAddedCount: result.addedCount } };
  }
  await payeesService.deletePayee({ userId: user.id, id: params.id });
  return { statusCode: 204 };
});
