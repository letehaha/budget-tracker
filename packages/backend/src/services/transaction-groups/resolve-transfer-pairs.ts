import type { RecordId } from '@bt/shared/types';
import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { findTransactions } from '@models/transactions-query';
import { Op } from 'sequelize';

/**
 * Given a list of transaction IDs, finds any transfer-paired opposite transactions
 * that aren't already in the list and returns the full expanded set.
 * This ensures that when a transfer transaction is added to a group, its opposite
 * side is automatically included.
 */
export const resolveTransferPairs = async ({
  transactionIds,
  userId,
}: {
  transactionIds: RecordId[];
  userId: number;
}): Promise<RecordId[]> => {
  // Get transferIds from the provided transactions that are common transfers.
  // A plan can only ever be `not_transfer` (assert-planned-invariants), so it owns no
  // transferId and no pair — `planned: 'exclude'` is that invariant stated at the query.
  const transferTxs = await findTransactions({
    where: {
      id: { [Op.in]: transactionIds },
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      transferId: { [Op.ne]: null },
    },
    planned: 'exclude',
    access: { creator: userId },
    balanceAdjustments: 'include',
    completeness: 'all',
    attributes: ['transferId'],
    raw: true,
  });

  const transferIds = transferTxs.map((tx) => tx.transferId).filter(Boolean);

  if (transferIds.length === 0) return transactionIds;

  // Find opposite transactions sharing these transferIds. Creator-scoped, so a partner
  // leg authored by the other party on a shared account is not found — kept as is: the
  // cross-user case is an open product question, not something to decide here.
  const oppositeTransactions = await findTransactions({
    where: {
      transferId: { [Op.in]: transferIds },
      id: { [Op.notIn]: transactionIds },
    },
    planned: 'exclude',
    access: { creator: userId },
    balanceAdjustments: 'include',
    completeness: 'all',
    attributes: ['id'],
    raw: true,
  });

  return [...transactionIds, ...oppositeTransactions.map((tx) => tx.id as RecordId)];
};
