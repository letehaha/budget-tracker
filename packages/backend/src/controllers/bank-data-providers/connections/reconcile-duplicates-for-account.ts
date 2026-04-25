import { createController } from '@controllers/helpers/controller-factory';
import { reconcileDuplicatesForAccount } from '@root/services/bank-data-providers/connection/reconcile-duplicates-for-account';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
    body: z.object({
      accountId: z.number(),
    }),
  }),
  async ({ user, params, body }) => {
    const result = await reconcileDuplicatesForAccount({
      connectionId: params.connectionId,
      userId: user.id,
      accountId: body.accountId,
    });

    return { data: result };
  },
);
