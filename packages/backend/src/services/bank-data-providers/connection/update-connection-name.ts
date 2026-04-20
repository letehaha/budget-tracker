import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
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
    const connection = await findOrThrowNotFound({
      query: BankDataProviderConnections.findOne({
        where: { id: connectionId, userId },
      }),
      message: t({ key: 'errors.connectionNotFound' }),
    });

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
