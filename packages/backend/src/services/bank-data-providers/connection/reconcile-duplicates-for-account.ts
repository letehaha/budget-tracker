import { API_ERROR_CODES, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { t } from '@i18n/index';
import { BadRequestError, NotFoundError } from '@js/errors';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { withTransaction } from '@root/services/common/with-transaction';

import { EnableBankingProvider } from '../enablebanking/enablebanking.provider';
import { bankProviderRegistry } from '../registry';

/**
 * One-time reconciliation: deletes orphan duplicates (rows without
 * entryReference where a sibling row with entryReference exists for the same
 * fingerprint within ±2 days). Only enable_banking is supported today —
 * other providers don't have this hash-drift class of bug.
 */
export const reconcileDuplicatesForAccount = withTransaction(
  async ({ connectionId, userId, accountId }: { connectionId: number; userId: number; accountId: number }) => {
    const connection = await BankDataProviderConnections.findOne({
      where: { id: connectionId, userId },
    });
    if (!connection) {
      throw new NotFoundError({
        message: t({ key: 'errors.connectionNotFound' }),
        code: API_ERROR_CODES.notFound,
      });
    }

    const account = await Accounts.findOne({
      where: { id: accountId, userId, bankDataProviderConnectionId: connectionId },
    });
    if (!account) {
      throw new NotFoundError({
        message: t({ key: 'bankDataProviders.accountNotLinkedToConnection' }),
        code: API_ERROR_CODES.notFound,
      });
    }

    if (connection.providerType !== BANK_PROVIDER_TYPE.ENABLE_BANKING) {
      throw new BadRequestError({
        message: t({ key: 'bankDataProviders.reconciliationOnlyForEnableBanking' }),
      });
    }

    const provider = bankProviderRegistry.get(connection.providerType) as EnableBankingProvider;
    return provider.reconcileDuplicateTransactionsForAccount({ accountId });
  },
);
