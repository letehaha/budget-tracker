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
  > & { accountsCount: number })[]
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
  }));
};
