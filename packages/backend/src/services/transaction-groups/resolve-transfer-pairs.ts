import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
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
  transactionIds: number[];
  userId: number;
}): Promise<number[]> => {
  // Get transferIds from the provided transactions that are common transfers
  const transferTxs = await Transactions.findAll({
    where: {
      id: { [Op.in]: transactionIds },
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      transferId: { [Op.ne]: null },
    },
    attributes: ['transferId'],
    raw: true,
  });

  const transferIds = transferTxs.map((tx) => tx.transferId).filter(Boolean);

  if (transferIds.length === 0) return transactionIds;

  // Find opposite transactions sharing these transferIds
  const oppositeTransactions = await Transactions.findAll({
    where: {
      transferId: { [Op.in]: transferIds },
      userId,
      id: { [Op.notIn]: transactionIds },
    },
    attributes: ['id'],
    raw: true,
  });

  return [...transactionIds, ...oppositeTransactions.map((tx) => tx.id)];
};
