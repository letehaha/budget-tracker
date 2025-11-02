import { createController } from '@controllers/helpers/controller-factory';
import { listExternalAccounts } from '@root/services/bank-data-providers/connection/list-external-accounts';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
  }),
  async ({ user, params }) => {
    const accounts = await listExternalAccounts({ connectionId: params.connectionId, userId: user.id });

    return {
      data: {
        accounts,
      },
    };
  },
);
