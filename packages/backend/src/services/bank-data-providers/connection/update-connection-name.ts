import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { withTransaction } from '@services/common/with-transaction';

interface UpdateConnectionNameParams {
  connectionId: number;
  userId: number;
  providerName: string;
}

/**
 * Update a bank connection's display name.
 * If the connection has a linked AccountGroup whose name still matches the old
 * connection name, the group name is synced automatically. If the user has
 * manually renamed the group, the sync is skipped.
 */
export const updateConnectionName = withTransaction(
  async ({ connectionId, userId, providerName }: UpdateConnectionNameParams) => {
    const connection = await BankDataProviderConnections.findOne({
      where: { id: connectionId, userId },
    });

    if (!connection) {
      throw new NotFoundError({ message: t({ key: 'errors.connectionNotFound' }) });
    }

    const oldProviderName = connection.providerName;
    connection.providerName = providerName;
    await connection.save();

    // Sync the account group name if it still matches the old connection name.
    // If the group name differs, the user has manually renamed it — skip the sync.
    const connectionGroup = await AccountGroup.findOne({
      where: { bankDataProviderConnectionId: connectionId, userId },
    });

    if (connectionGroup && connectionGroup.name === oldProviderName) {
      connectionGroup.name = providerName;
      await connectionGroup.save();
    }

    return connection;
  },
);
