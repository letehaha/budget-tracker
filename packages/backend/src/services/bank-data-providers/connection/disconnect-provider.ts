import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import Users from '@models/users.model';
import { withTransaction } from '@root/services/common/with-transaction';
import { unlinkAccountFromBankConnection } from '@services/accounts/unlink-from-bank-connection';
import {
  AccountShareCleanupResult,
  cleanupAccountSharesInTx,
  notifyAccountDeleteRecipients,
} from '@services/sharing/cleanup/cleanup-account-shares.service';

import { bankProviderRegistry } from '../registry';

interface DisconnectProviderInTxResult {
  /** One entry per destroyed account that had shares — fed to the post-commit fan-out so
   *  recipients learn about the cascade. Empty when `removeAssociatedAccounts === false`
   *  or none of the destroyed accounts were shared. */
  cleanups: Array<{
    account: { id: number; name: string };
    recipients: AccountShareCleanupResult['recipients'];
  }>;
}

const disconnectProviderInTx = withTransaction(
  async ({
    connectionId,
    userId,
    removeAssociatedAccounts = false,
  }: {
    connectionId: number;
    userId: number;
    removeAssociatedAccounts?: boolean;
  }): Promise<DisconnectProviderInTxResult> => {
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

    const cleanups: DisconnectProviderInTxResult['cleanups'] = [];

    if (removeAssociatedAccounts) {
      // Bulk `Accounts.destroy` below skips per-instance hooks AND bypasses the
      // account-delete service that normally runs share cleanup. Walk each account
      // through `cleanupAccountSharesInTx` first so any `ResourceShares` rows and
      // pending invitations get the same in-tx pruning + post-commit notification
      // treatment as a direct `DELETE /accounts/:id`.
      for (const account of linkedAccounts) {
        const cleanup = await cleanupAccountSharesInTx({ accountId: account.id, ownerUserId: userId });
        if (cleanup.recipients.length > 0) {
          cleanups.push({
            account: { id: account.id, name: account.name },
            recipients: cleanup.recipients,
          });
        }
      }

      await Accounts.destroy({
        where: {
          userId,
          bankDataProviderConnectionId: connectionId,
        },
      });
    } else {
      // Reset each account to system type, preserving connection history
      // and transaction original IDs (same as individual account unlink). Shares
      // survive the unlink — the account row sticks around, just stops being
      // bank-managed.
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

    return { cleanups };
  },
);

/**
 * Disconnects a bank-data-provider connection. The in-tx phase commits the destroy /
 * unlink work atomically; share-recipient notifications fire post-commit so a transient
 * notification failure can't re-open a destroyed account.
 */
export const disconnectProvider = async (params: {
  connectionId: number;
  userId: number;
  removeAssociatedAccounts?: boolean;
}): Promise<void> => {
  const result = await disconnectProviderInTx(params);

  if (result.cleanups.length === 0) return;

  // Single owner fetch for the whole batch — every cleanup belongs to the same user.
  const owner = await Users.findByPk(params.userId);
  await Promise.all(
    result.cleanups.map((entry) =>
      notifyAccountDeleteRecipients({
        recipients: entry.recipients,
        owner,
        account: entry.account,
      }),
    ),
  );
};
