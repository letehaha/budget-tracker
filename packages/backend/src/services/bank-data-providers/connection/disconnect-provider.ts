import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { withTransaction } from '@root/services/common';

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
      // No connection? Deleted already
      return;
    }

    // Delete associated accounts if requested
    if (removeAssociatedAccounts) {
      await Accounts.destroy({
        where: {
          userId,
          bankDataProviderConnectionId: connectionId,
        },
      });
    }

    const provider = bankProviderRegistry.get(connection.providerType as BANK_PROVIDER_TYPE);
    await provider.disconnect(connectionId);

    return;
  },
);
