import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import TransactionGroupItems from '@models/transaction-group-items.model';
import TransactionGroups from '@models/transaction-groups.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

import { MIN_GROUP_SIZE, INCLUDE_GROUP_TRANSACTIONS } from './constants';
import { resolveTransferPairs } from './resolve-transfer-pairs';

interface RemoveTransactionsFromGroupPayload {
  groupId: number;
  userId: number;
  transactionIds: number[];
  force?: boolean;
}

export const removeTransactionsFromGroup = withTransaction(async (payload: RemoveTransactionsFromGroupPayload) => {
  const { groupId, userId, transactionIds, force = false } = payload;

  const group = await TransactionGroups.findOne({
    where: { id: groupId, userId },
  });

  if (!group) {
    throw new NotFoundError({ message: 'Transaction group not found.' });
  }

  // Verify the requested transactions belong to this group
  const requestedItems = await TransactionGroupItems.findAll({
    where: {
      groupId,
      transactionId: { [Op.in]: transactionIds },
    },
    attributes: ['transactionId'],
  });

  if (requestedItems.length !== transactionIds.length) {
    throw new ValidationError({
      message: 'Some transactions are not members of this group.',
    });
  }

  // Auto-include opposite sides of transfer pairs
  const expandedIds = await resolveTransferPairs({ transactionIds, userId });

  // Find which expanded IDs (including transfer pairs) are in this group
  const allItemsToRemove = await TransactionGroupItems.findAll({
    where: {
      groupId,
      transactionId: { [Op.in]: expandedIds },
    },
    attributes: ['transactionId'],
  });

  const idsToRemove = allItemsToRemove.map((item) => item.transactionId);

  const currentCount = await TransactionGroupItems.count({
    where: { groupId },
  });

  const remainingCount = currentCount - idsToRemove.length;

  if (remainingCount < MIN_GROUP_SIZE) {
    if (!force) {
      throw new ConflictError({
        message: `Removing these transactions would leave only ${Math.max(0, remainingCount)} transaction(s) in the group. The group will be dissolved.`,
        details: {
          wouldDissolve: true,
          remainingCount: Math.max(0, remainingCount),
        },
      });
    }

    await group.destroy();

    return { group: null, dissolved: true };
  }

  await TransactionGroupItems.destroy({
    where: {
      groupId,
      transactionId: { [Op.in]: idsToRemove },
    },
  });

  const result = await TransactionGroups.findByPk(groupId, {
    include: [INCLUDE_GROUP_TRANSACTIONS],
  });

  return { group: result!, dissolved: false };
});
