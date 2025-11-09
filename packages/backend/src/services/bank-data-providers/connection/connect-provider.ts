import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { withTransaction } from '@root/services/common';

import { EnableBankingProvider } from '../enablebanking';
import { bankProviderRegistry } from '../registry';
import { BankProviderType } from '../types';

export const connectProvider = withTransaction(
  async ({
    providerType,
    userId,
    credentials,
    providerName,
  }: {
    providerType: BankProviderType;
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
    if (providerType === BankProviderType.ENABLE_BANKING) {
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
