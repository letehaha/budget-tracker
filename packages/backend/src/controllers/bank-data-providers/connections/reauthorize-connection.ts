import { createController } from '@controllers/helpers/controller-factory';
import { NotFoundError } from '@js/errors';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { bankProviderRegistry } from '@services/bank-data-providers/registry';
import { BankProviderType } from '@services/bank-data-providers/types';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
  }),
  async ({ user, params }) => {
    // Fetch connection for this user
    const connection = await BankDataProviderConnections.findOne({
      where: {
        id: params.connectionId,
        userId: user.id,
      },
    });

    if (!connection) {
      throw new NotFoundError({ message: 'Connection not found' });
    }

    // Get provider
    const provider = bankProviderRegistry.get(connection.providerType as BankProviderType);

    // Check if provider has reauthorize method (Enable Banking specific)
    if (!('reauthorize' in provider)) {
      throw new Error(`Provider ${connection.providerType} does not support reauthorization`);
    }

    // Call provider's reauthorize method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authUrl = await (provider as any).reauthorize(params.connectionId);

    return {
      data: {
        authUrl,
        message: 'Reauthorization started. Please complete the OAuth flow.',
      },
    };
  },
);
