import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';

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
        where: { isEnabled: true },
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
