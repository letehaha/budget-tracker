import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
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
    const connection = await findOrThrowNotFound({
      query: BankDataProviderConnections.findOne({
        where: {
          id: connectionId,
          userId,
        },
      }),
      message: t({ key: 'errors.connectionNotFound' }),
    });

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
