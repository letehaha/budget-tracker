import { createController } from '@controllers/helpers/controller-factory';
import { getConnectionDetails } from '@root/services/bank-data-providers/connection/get-connection-details';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
  }),
  async ({ user, params }) => {
    const connection = await getConnectionDetails({ connectionId: params.connectionId, userId: user.id });

    return {
      data: {
        connection,
      },
    };
  },
);
