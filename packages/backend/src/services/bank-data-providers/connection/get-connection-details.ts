import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';

import { bankProviderRegistry } from '../registry';

interface GetConnectionDetailsParams {
  connectionId: number;
  userId: number;
}

export interface ConnectionDetailsResponse {
  id: number;
  providerType: string;
  providerName: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  provider: {
    name: string;
    description: string;
    logoUrl?: string;
    documentationUrl?: string;
    features: {
      supportsWebhooks: boolean;
      supportsRealtime: boolean;
      requiresReauth: boolean;
      supportsManualSync: boolean;
      supportsAutoSync: boolean;
      defaultSyncInterval?: number;
      minSyncInterval?: number;
    };
  };
  accounts: Array<{
    id: number;
    name: string;
    externalId: string;
    currentBalance: number;
    currencyCode: string;
    type: string;
  }>;
}

export async function getConnectionDetails(params: GetConnectionDetailsParams): Promise<ConnectionDetailsResponse> {
  const { connectionId, userId } = params;

  // Fetch connection with associated accounts
  const connection = await BankDataProviderConnections.findOne({
    where: {
      id: connectionId,
      userId,
    },
    include: [
      {
        model: Accounts,
        as: 'accounts',
        attributes: ['id', 'name', 'externalId', 'currentBalance', 'currencyCode', 'type'],
      },
    ],
  });

  if (!connection) {
    throw new NotFoundError({ message: 'Connection not found' });
  }

  // Get provider metadata
  const provider = bankProviderRegistry.get(connection.providerType);

  if (!provider) {
    throw new Error(`Provider ${connection.providerType} not found in registry`);
  }

  const providerMetadata = provider.metadata;

  return {
    id: connection.id,
    providerType: connection.providerType,
    providerName: connection.providerName,
    isActive: connection.isActive,
    lastSyncAt: connection.lastSyncAt?.toISOString() || null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    provider: {
      name: providerMetadata.name,
      description: providerMetadata.description,
      logoUrl: providerMetadata.logoUrl,
      documentationUrl: providerMetadata.documentationUrl,
      features: providerMetadata.features,
    },
    accounts: connection.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      externalId: account.externalId,
      currentBalance: account.currentBalance,
      currencyCode: account.currencyCode,
      type: account.type,
    })),
  };
}
