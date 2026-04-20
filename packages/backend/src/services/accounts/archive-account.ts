import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import Accounts from '@models/accounts.model';
import Subscriptions from '@models/subscriptions.model';

import { unlinkAccountFromBankConnection } from './unlink-from-bank-connection';

interface ArchiveAccountPayload {
  account: Accounts;
  userId: number;
}

/**
 * Performs archive side effects for an account:
 * 1. Unlinks bank data provider connection (preserving reconnection metadata)
 * 2. Removes from all account groups
 * 3. Unlinks subscriptions (sets accountId to null)
 *
 * This does NOT update the account status itself — that's handled by the
 * caller (updateAccount) to keep side effects separate from the status change.
 *
 * NOT wrapped in withTransaction — must be called from within an existing
 * transaction (e.g. from updateAccount).
 */
export const archiveAccount = async ({ account, userId }: ArchiveAccountPayload) => {
  const accountId = account.id;

  // 1. Unlink bank connection if connected (preserves connectionHistory metadata)
  if (account.bankDataProviderConnectionId) {
    await unlinkAccountFromBankConnection({ accountId, userId });
  }

  // 2. Remove from all account groups
  await AccountGrouping.destroy({ where: { accountId } });

  // 3. Unlink subscriptions
  await Subscriptions.update({ accountId: null }, { where: { accountId } });
};
