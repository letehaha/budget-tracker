import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import Accounts from '@models/accounts.model';
import { countTransactions } from '@models/transactions-query';

export const getAccountTransactionCount = async ({ userId, accountId }: { userId: number; accountId: RecordId }) => {
  // Owner-scoped like the delete path: a share recipient can read the account but cannot
  // delete it, so this count is not theirs to see.
  await findOrThrowNotFound({
    query: Accounts.findOne({ where: { id: accountId, userId } }),
    message: t({ key: 'accounts.accountNotFound' }),
  });

  // Drives the delete confirmation, so it must equal what the delete destroys:
  // `Transactions.accountId` is ON DELETE CASCADE, which takes planned rows, balance
  // adjustments and rows authored by share recipients alike.
  return countTransactions({
    where: { accountId },
    planned: 'include',
    access: { accountOwner: userId },
    balanceAdjustments: 'include',
  });
};
