import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { bankProviderRegistry } from '@services/bank-data-providers/registry';
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
      throw new NotFoundError({ message: t({ key: 'errors.connectionNotFound' }) });
    }

    // Get provider
    const provider = bankProviderRegistry.get(connection.providerType as BANK_PROVIDER_TYPE);

    // Check if provider has reauthorize method (Enable Banking specific)
    if (!('reauthorize' in provider)) {
      throw new Error(
        t({ key: 'errors.providerNoReauthorization', variables: { providerType: connection.providerType } }),
      );
    }

    // Call provider's reauthorize method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authUrl = await (provider as any).reauthorize(params.connectionId);

    return {
      data: {
        authUrl,
        message: t({ key: 'bankDataProviders.reauthorizationStarted' }),
      },
    };
  },
);
