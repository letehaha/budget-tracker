import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import AccountGrouping from '@models/accounts-groups/AccountGrouping.model';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { withTransaction } from '@root/services/common/with-transaction';
import { unlinkAccountFromBankConnection } from '@services/accounts/unlink-from-bank-connection';

import { bankProviderRegistry } from '../registry';

export const disconnectProvider = withTransaction(
  async ({
    connectionId,
    userId,
    removeAssociatedAccounts = false,
  }: {
    connectionId: number;
    userId: number;
    removeAssociatedAccounts?: boolean;
  }): Promise<void> => {
    const connection = await BankDataProviderConnections.findOne({
      where: {
        id: connectionId,
        userId,
      },
    });

    if (!connection) {
      return;
    }

    const linkedAccounts = await Accounts.findAll({
      where: {
        userId,
        bankDataProviderConnectionId: connectionId,
      },
    });

    if (removeAssociatedAccounts) {
      await Accounts.destroy({
        where: {
          userId,
          bankDataProviderConnectionId: connectionId,
        },
      });
    } else {
      // Reset each account to system type, preserving connection history
      // and transaction original IDs (same as individual account unlink)
      for (const account of linkedAccounts) {
        await unlinkAccountFromBankConnection({ accountId: account.id, userId });
      }
    }

    // Delete the connection's AccountGroup (and its AccountGroupings via cascade).
    // Accounts that were moved to user-created groups are unaffected.
    const connectionGroup = await AccountGroup.findOne({
      where: { bankDataProviderConnectionId: connectionId, userId },
    });

    if (connectionGroup) {
      await AccountGrouping.destroy({ where: { groupId: connectionGroup.id } });
      await connectionGroup.destroy();
    }

    const provider = bankProviderRegistry.get(connection.providerType as BANK_PROVIDER_TYPE);
    await provider.disconnect(connectionId);
  },
);
