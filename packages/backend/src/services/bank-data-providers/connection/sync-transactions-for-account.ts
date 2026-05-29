import { API_ERROR_CODES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { withTransaction } from '@root/services/common/with-transaction';

import { bankProviderRegistry } from '../registry';

export const syncTransactionsForAccount = withTransaction(
  async ({ connectionId, userId, accountId }: { connectionId: string; userId: number; accountId: string }) => {
    // Re-loads connection + account by id to re-check ownership on every call,
    // keeping this safe as a standalone entry point. The resulting N+1 in the
    // auto-sync fan-out is by design (background work, runs after the response).
    const connection = await BankDataProviderConnections.findOne({
      where: {
        id: connectionId,
        userId: userId,
      },
    });

    if (!connection) {
      throw new NotFoundError({
        message: t({ key: 'errors.connectionNotFound' }),
        code: API_ERROR_CODES.notFound,
      });
    }

    // Verify account belongs to user and is linked to this connection
    const account = await Accounts.findOne({
      where: {
        id: accountId,
        userId: userId,
        bankDataProviderConnectionId: connectionId,
      },
    });

    if (!account) {
      throw new NotFoundError({
        message: t({ key: 'bankDataProviders.accountNotLinkedToConnection' }),
        code: API_ERROR_CODES.notFound,
      });
    }

    const provider = bankProviderRegistry.get(connection.providerType);
    return provider.syncTransactions({ connectionId, systemAccountId: accountId, userId });
  },
);
