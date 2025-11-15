import { createController } from '@controllers/helpers/controller-factory';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { NotFoundError } from '@root/js/errors';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
    body: z.object({
      providerName: z.string().min(1).max(255),
    }),
  }),
  async ({ user, params, body }) => {
    const connection = await BankDataProviderConnections.findOne({
      where: {
        id: params.connectionId,
        userId: user.id,
      },
    });

    if (!connection) {
      throw new NotFoundError({
        message: 'Connection not found',
      });
    }

    // Update the provider name
    connection.providerName = body.providerName;
    await connection.save();

    return {
      data: {
        message: 'Connection details updated successfully',
        connection: {
          id: connection.id,
          providerName: connection.providerName,
          providerType: connection.providerType,
          isActive: connection.isActive,
          lastSyncAt: connection.lastSyncAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      },
    };
  },
);
