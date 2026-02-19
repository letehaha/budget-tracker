import { TRANSACTION_TRANSFER_NATURE, endpointsTypes } from '@bt/shared/types';
import { NotFoundError, ValidationError } from '@js/errors';
import Categories from '@models/Categories.model';
import Tags from '@models/Tags.model';
import * as Transactions from '@models/Transactions.model';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';

interface BulkUpdateParams {
  userId: number;
  transactionIds: number[];
  categoryId?: number;
  tagIds?: number[];
  tagMode?: endpointsTypes.BulkUpdateTagMode;
  note?: string;
}

interface BulkUpdateResult {
  updatedCount: number;
  updatedIds: number[];
}

export const bulkUpdate = withTransaction(
  async ({
    userId,
    transactionIds,
    categoryId,
    tagIds,
    tagMode = 'add',
    note,
  }: BulkUpdateParams): Promise<BulkUpdateResult> => {
    // Validate at least one field is being updated
    const hasCategory = categoryId !== undefined;
    const hasTags = tagIds !== undefined;
    const hasNote = note !== undefined;

    if (!hasCategory && !hasTags && !hasNote) {
      throw new ValidationError({
        message: 'At least one field must be provided for bulk update',
      });
    }

    // Validate category if provided
    if (hasCategory) {
      const category = await Categories.findOne({
        where: { id: categoryId, userId },
      });

      if (!category) {
        throw new NotFoundError({
          message: 'Category not found',
        });
      }
    }

    // Validate tags if provided
    if (hasTags && tagIds.length > 0) {
      const userTags = await Tags.findAll({
        where: { userId, id: { [Op.in]: tagIds } },
      });

      if (userTags.length !== tagIds.length) {
        throw new ValidationError({
          message: 'Some tags do not belong to the current user',
        });
      }
    }

    // Fetch transactions to validate ownership and filter out invalid ones
    const transactions = await Transactions.default.findAll({
      where: {
        id: { [Op.in]: transactionIds },
        userId,
      },
      attributes: ['id', 'transferNature'],
    });

    if (transactions.length === 0) {
      throw new NotFoundError({
        message: 'No valid transactions found',
      });
    }

    // Filter out transfer transactions - they cannot have category updated
    // But they CAN have tags and notes updated
    const nonTransferIds = transactions
      .filter((tx) => tx.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer)
      .map((tx) => tx.id);

    const allTransactionIds = transactions.map((tx) => tx.id);

    // For category updates, only non-transfer transactions are valid
    if (hasCategory && nonTransferIds.length === 0) {
      throw new ValidationError({
        message: 'No valid transactions to update. Transfer transactions cannot have their category changed.',
      });
    }

    // Build update payload for non-relationship fields
    const updatePayload: { categoryId?: number; note?: string } = {};
    if (hasCategory) {
      updatePayload.categoryId = categoryId;
    }
    if (hasNote) {
      updatePayload.note = note;
    }

    // Perform bulk update for category and note
    if (Object.keys(updatePayload).length > 0) {
      // Category can only be updated on non-transfer transactions
      // Note can be updated on all transactions
      if (hasCategory) {
        await Transactions.updateTransactions(
          updatePayload,
          {
            userId,
            id: { [Op.in]: nonTransferIds },
            transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          },
          { individualHooks: false },
        );
      } else if (hasNote) {
        // Only note update - can apply to all transactions
        await Transactions.updateTransactions(
          { note },
          {
            userId,
            id: { [Op.in]: allTransactionIds },
          },
          { individualHooks: false },
        );
      }
    }

    // Handle tags update separately (many-to-many relationship)
    if (hasTags) {
      const fullTransactions = await Transactions.default.findAll({
        where: {
          id: { [Op.in]: allTransactionIds },
          userId,
        },
      });

      for (const tx of fullTransactions) {
        switch (tagMode) {
          case 'replace':
            // Replace all existing tags with new ones
            await tx.$set('tags', tagIds);
            break;
          case 'remove':
            // Remove specified tags from existing ones
            await tx.$remove('tags', tagIds);
            break;
          case 'add':
          default:
            // Add tags to existing ones
            await tx.$add('tags', tagIds);
            break;
        }
      }

      // Bump updatedAt for all affected transactions so UI can detect changes
      // (tag changes only modify junction table, not the transaction itself)
      // Use instance-level save() to properly trigger Sequelize's timestamp update
      await Promise.all(
        fullTransactions.map((tx) => {
          tx.changed('updatedAt', true);
          return tx.save({ silent: false });
        }),
      );

      // Emit event for real-time reminders check (only for add/replace modes)
      if (tagIds.length > 0 && tagMode !== 'remove') {
        eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds, userId });
      }
    }

    // Return the appropriate count based on what was updated
    const updatedIds = hasCategory ? nonTransferIds : allTransactionIds;

    return {
      updatedCount: updatedIds.length,
      updatedIds,
    };
  },
);
