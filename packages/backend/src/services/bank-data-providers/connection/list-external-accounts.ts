import { API_ERROR_CODES } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { withTransaction } from '@root/services/common';
import { BankProviderType, ProviderAccount, bankProviderRegistry } from '@services/bank-data-providers';

export const listExternalAccounts = withTransaction(
  async ({ connectionId, userId }: { connectionId: number; userId: number }): Promise<ProviderAccount[]> => {
    try {
      const connection = await BankDataProviderConnections.findOne({
        where: {
          id: connectionId,
          userId,
        },
      });

      if (!connection) {
        throw new NotFoundError({
          message: 'Connection not found',
          code: API_ERROR_CODES.notFound,
        });
      }

      const provider = bankProviderRegistry.get(connection.providerType as BankProviderType);
      const accounts = await provider.fetchAccounts(connectionId);

      return accounts.map((acc) => ({
        externalId: acc.externalId,
        name: acc.name,
        type: acc.type,
        balance: acc.balance,
        currency: acc.currency,
        metadata: acc.metadata,
      }));
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
);
