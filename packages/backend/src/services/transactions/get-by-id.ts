import { RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import TransactionSplits from '@models/transaction-splits.model';
import TransactionsModel, * as Transactions from '@models/transactions.model';
import { canUserAccessResource } from '@services/sharing/can-user-access-resource.service';

import { withTransaction } from '../common/with-transaction';

/**
 * Fetch a transaction visible to the caller.
 *
 * Visibility resolution:
 *   1. Caller is the transaction's creator → return as before (existing behaviour).
 *   2. Otherwise, the transaction lives on an account the caller has at least read
 *      access to (owner or accepted-share recipient). Used by the shared-account read
 *      paths added in S3.
 *   3. If neither, return `null` (the controller surfaces a 404).
 */
export const getTransactionById = withTransaction(
  async ({ id, userId, includeSplits }: { id: number; userId: number; includeSplits?: boolean }) => {
    const owned = await Transactions.getTransactionById({ id, userId, includeSplits });
    if (owned) return owned;

    // Fall back to shared lookup. Read the transaction without the userId filter so we
    // can inspect its accountId, then ask the auth service whether the caller has at
    // least read access to that account.
    const tx = await TransactionsModel.findOne({ where: { id } });
    if (!tx) return null;

    const access = await canUserAccessResource({
      userId,
      resourceType: RESOURCE_TYPES.account,
      resourceId: tx.accountId,
      requiredPermission: SHARE_PERMISSIONS.read,
    });
    if (!access.granted) return null;

    if (includeSplits) {
      return TransactionsModel.findOne({
        where: { id },
        include: [{ model: TransactionSplits, as: 'splits' }],
      });
    }
    return tx;
  },
);
