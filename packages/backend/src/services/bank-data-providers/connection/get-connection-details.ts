import { t } from '@i18n/index';
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
  consent?: {
    validFrom: string | null;
    validUntil: string | null;
    daysRemaining: number | null;
    isExpired: boolean;
    isExpiringSoon: boolean; // Less than 7 days remaining
  };
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
    throw new NotFoundError({ message: t({ key: 'errors.connectionNotFound' }) });
  }

  // Get provider metadata
  const provider = bankProviderRegistry.get(connection.providerType);

  if (!provider) {
    throw new Error(
      t({ key: 'errors.providerNotFoundInRegistry', variables: { providerType: connection.providerType } }),
    );
  }

  const providerMetadata = provider.metadata;

  // Calculate consent validity info if available in metadata
  let consentInfo: ConnectionDetailsResponse['consent'] = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata = connection.metadata as any;

  if (metadata?.consentValidUntil) {
    const now = new Date();
    const validUntil = new Date(metadata.consentValidUntil);
    const validFrom = metadata.consentValidFrom ? new Date(metadata.consentValidFrom) : null;

    const msRemaining = validUntil.getTime() - now.getTime();
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    const isExpired = msRemaining <= 0;
    const isExpiringSoon = !isExpired && daysRemaining <= 7;

    consentInfo = {
      validFrom: validFrom?.toISOString() || null,
      validUntil: validUntil.toISOString(),
      daysRemaining: isExpired ? 0 : daysRemaining,
      isExpired,
      isExpiringSoon,
    };
  }

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
    consent: consentInfo,
  };
}
