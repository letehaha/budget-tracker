import { ConflictError, ValidationError } from '@js/errors';
import TransactionGroupItems from '@models/transaction-group-items.model';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

/**
 * Validates that the given transaction IDs:
 * 1. All belong to the specified user
 * 2. None already belong to any group
 *
 * Throws ValidationError or ConflictError if validation fails.
 */
export async function validateTransactionsForGroup({
  transactionIds,
  userId,
}: {
  transactionIds: number[];
  userId: number;
}): Promise<void> {
  // Use count() instead of findAll() — we only need the count, not full rows
  const matchingCount = await Transactions.count({
    where: {
      id: { [Op.in]: transactionIds },
      userId,
    },
  });

  if (matchingCount !== transactionIds.length) {
    throw new ValidationError({
      message: 'Some transaction IDs are invalid or do not belong to you.',
    });
  }

  const existingGroupItems = await TransactionGroupItems.findAll({
    where: {
      transactionId: { [Op.in]: transactionIds },
    },
    attributes: ['transactionId'],
  });

  if (existingGroupItems.length > 0) {
    throw new ConflictError({
      message: 'Some transactions already belong to a group.',
      details: {
        transactionIds: existingGroupItems.map((item) => item.transactionId),
      },
    });
  }
}
