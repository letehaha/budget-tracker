import { createController } from '@controllers/helpers/controller-factory';
import { disconnectProvider } from '@root/services/bank-data-providers/connection/disconnect-provider';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
    query: z.object({
      removeAssociatedAccounts: z
        .string()
        .optional()
        .default('false')
        .transform((val) => val === 'true'),
    }),
  }),
  async ({ user, params, query }) => {
    await disconnectProvider({
      connectionId: params.connectionId,
      userId: user.id,
      removeAssociatedAccounts: query.removeAssociatedAccounts,
    });

    return {
      data: {
        message: 'Connection removed successfully',
      },
    };
  },
);
