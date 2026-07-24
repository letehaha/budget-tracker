import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';

import { bankProviderRegistry } from '../registry';
import { computeConsentValidity } from './consent-validity';

interface GetConnectionDetailsParams {
  connectionId: string;
  userId: number;
}

export interface ConnectionDetailsResponse {
  id: string;
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
    id: string;
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
  deactivationReason?: string | null;
}

export async function getConnectionDetails(params: GetConnectionDetailsParams): Promise<ConnectionDetailsResponse> {
  const { connectionId, userId } = params;

  // Fetch connection with associated accounts
  const connection = await findOrThrowNotFound({
    query: BankDataProviderConnections.findOne({
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
    }),
    message: t({ key: 'errors.connectionNotFound' }),
  });

  // Get provider metadata
  const provider = bankProviderRegistry.get(connection.providerType);

  if (!provider) {
    throw new Error(
      t({ key: 'errors.providerNotFoundInRegistry', variables: { providerType: connection.providerType } }),
    );
  }

  const providerMetadata = provider.metadata;

  // Consent validity for the expiry banner; absent when metadata carries no consent window
  const consentInfo = computeConsentValidity({ metadata: connection.metadata });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata = connection.metadata as any;

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
      currentBalance: account.currentBalance?.toNumber() ?? 0,
      currencyCode: account.currencyCode,
      type: account.type,
    })),
    consent: consentInfo,
    deactivationReason: metadata?.deactivationReason || null,
  };
}
