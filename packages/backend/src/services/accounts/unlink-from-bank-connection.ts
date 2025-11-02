import { ACCOUNT_TYPES } from '@bt/shared/types';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Transactions from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';

interface UnlinkAccountFromBankConnectionPayload {
  accountId: number;
  userId: number;
}

/**
 * Unlinks an account from its bank connection and converts it to a system account.
 * This operation:
 * 1. Converts the account type to 'system'
 * 2. Stores connection history in account's externalData
 * 3. Updates all transactions to 'system' type and stores their original IDs in externalData
 * 4. Clears the bankDataProviderConnectionId
 */
export const unlinkAccountFromBankConnection = withTransaction(
  async ({ accountId, userId }: UnlinkAccountFromBankConnectionPayload) => {
    // Fetch the account
    const account = await Accounts.findByPk(accountId);

    if (!account || account.userId !== userId) {
      throw new NotFoundError({
        message: `Account with id "${accountId}" not found.`,
      });
    }

    // Verify account is actually connected to a bank
    if (!account.bankDataProviderConnectionId) {
      throw new ValidationError({
        message: 'Account is not linked to any bank connection.',
      });
    }

    // Get the bank connection details before unlinking
    const bankConnection = await BankDataProviderConnections.findByPk(account.bankDataProviderConnectionId);

    // Prepare connection history for account's externalData
    const existingExternalData = (account.externalData as Record<string, unknown>) || {};
    const updatedAccountExternalData = {
      ...existingExternalData,
      connectionHistory: {
        lastDisconnectedAt: new Date().toISOString(),
        previousConnection: {
          type: account.type,
          externalId: account.externalId,
          bankDataProviderConnectionId: account.bankDataProviderConnectionId,
          providerType: bankConnection?.providerType || null,
        },
      },
    };

    // Update the account: convert to system type and clear bank-related fields
    await account.update({
      type: ACCOUNT_TYPES.system,
      bankDataProviderConnectionId: null,
      externalId: null,
      externalData: updatedAccountExternalData,
    });

    // Update all transactions associated with this account
    const transactions = await Transactions.findAll({
      where: { accountId },
    });

    // Update each transaction to system type and preserve original IDs
    await Promise.all(
      transactions.map(async (transaction) => {
        const existingTxExternalData = (transaction.externalData as Record<string, unknown>) || {};

        // Only add originalSource if transaction actually had an originalId
        const updatedTxExternalData = transaction.originalId
          ? {
              ...existingTxExternalData,
              originalSource: {
                originalId: transaction.originalId,
                importedFrom: bankConnection?.providerType || null,
                accountType: transaction.accountType,
              },
            }
          : existingTxExternalData;

        await transaction.update({
          accountType: ACCOUNT_TYPES.system,
          originalId: null,
          externalData: updatedTxExternalData,
        });
      }),
    );

    // Fetch and return the updated account
    const updatedAccount = await Accounts.findByPk(accountId);
    return updatedAccount;
  },
);
