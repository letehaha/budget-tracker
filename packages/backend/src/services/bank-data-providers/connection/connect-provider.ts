import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { withTransaction } from '@root/services/common';

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
  }): Promise<{ connectionId: number }> => {
    const provider = bankProviderRegistry.get(providerType);

    // Create connection (stores encrypted credentials)
    const connectionId = await provider.connect(userId, credentials);

    // Update provider name if provided
    if (providerName) {
      await BankDataProviderConnections.update({ providerName: providerName }, { where: { id: connectionId } });
    }

    return { connectionId };
  },
);
