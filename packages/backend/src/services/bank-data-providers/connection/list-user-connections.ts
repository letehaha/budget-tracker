import { ACCOUNT_STATUSES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';

export const listUserConnections = async ({
  userId,
}: {
  userId: number;
}): Promise<
  (Pick<
    BankDataProviderConnections,
    'id' | 'providerType' | 'providerName' | 'isActive' | 'lastSyncAt' | 'createdAt'
  > & { accountsCount: number; bankName: string | null })[]
> => {
  const connections = await BankDataProviderConnections.findAll({
    where: { userId },
    include: [
      {
        model: Accounts,
        as: 'accounts',
        where: { status: ACCOUNT_STATUSES.active },
        required: false,
      },
    ],
    order: [['createdAt', 'DESC']],
  });

  return connections.map((conn) => ({
    id: conn.id,
    providerType: conn.providerType,
    providerName: conn.providerName,
    isActive: conn.isActive,
    lastSyncAt: conn.lastSyncAt,
    accountsCount: conn.accounts?.length || 0,
    createdAt: conn.createdAt,
    bankName:
      typeof (conn.metadata as Record<string, unknown>)?.bankName === 'string'
        ? ((conn.metadata as Record<string, unknown>).bankName as string)
        : null,
  }));
};
