import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { withTransaction } from '@root/services/common/with-transaction';

import { EnableBankingProvider } from '../enablebanking';
import { bankProviderRegistry } from '../registry';

export const connectProvider = withTransaction(
  async ({
    providerType,
    userId,
    credentials,
    providerName,
  }: {
    providerType: BANK_PROVIDER_TYPE;
    userId: number;
    credentials: Record<string, unknown>;
    providerName?: string;
  }): Promise<{ connectionId: number; authUrl?: string; message: string }> => {
    const provider = bankProviderRegistry.get(providerType);

    // Create connection (stores encrypted credentials)
    const connectionId = await provider.connect(userId, credentials);

    // Update provider name if provided
    if (providerName) {
      await BankDataProviderConnections.update({ providerName: providerName }, { where: { id: connectionId } });
    }

    // For Enable Banking, get the authorization URL
    let authUrl: string | undefined;
    if (providerType === BANK_PROVIDER_TYPE.ENABLE_BANKING) {
      const enableBankingProvider = provider as EnableBankingProvider;
      authUrl = await enableBankingProvider.getAuthorizationUrl(connectionId);
    }

    return {
      connectionId,
      authUrl,
      message: authUrl
        ? 'Connection created. Please authorize access via the provided URL.'
        : 'Provider connected successfully',
    };
  },
);
