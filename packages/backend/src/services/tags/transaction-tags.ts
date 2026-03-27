import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import Tags from '@models/tags.model';
import TransactionTags from '@models/transaction-tags.model';
import Transactions from '@models/transactions.model';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
import { withTransaction } from '@services/common/with-transaction';
import { autoResolveSuggestions } from '@services/tag-suggestions/tag-suggestions.service';
import { Op } from 'sequelize';

interface AddTransactionsToTagPayload {
  tagId: number;
  userId: number;
  transactionIds: number[];
}

export const addTransactionsToTag = withTransaction(async (payload: AddTransactionsToTagPayload) => {
  const { tagId, userId, transactionIds } = payload;

  await findOrThrowNotFound({
    query: Tags.findOne({ where: { id: tagId, userId } }),
    message: t({ key: 'tags.tagNotFound' }),
  });

  const transactions = await Transactions.findAll({
    where: {
      id: { [Op.in]: transactionIds },
      userId,
    },
  });

  if (transactions.length !== transactionIds.length) {
    throw new ValidationError({ message: t({ key: 'tags.someTransactionIdsInvalid' }) });
  }

  // Filter out transactions that are already tagged
  const existingLinks = await TransactionTags.findAll({
    where: {
      tagId,
      transactionId: { [Op.in]: transactionIds },
    },
  });

  const existingTransactionIds = new Set(existingLinks.map((link) => link.transactionId));
  const newTransactionIds = transactionIds.filter((id) => !existingTransactionIds.has(id));

  if (newTransactionIds.length > 0) {
    const transactionTags = newTransactionIds.map((transactionId) => ({
      tagId,
      transactionId,
    }));

    await TransactionTags.bulkCreate(transactionTags);

    // Emit event for real-time reminders check (handled by event listener)
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds: [tagId], userId });

    // Auto-resolve any pending tag suggestions for the same tag + transactions
    autoResolveSuggestions({ userId, transactionIds: newTransactionIds, tagId }).catch((error) => {
      logger.error({
        message: '[Tag Suggestions] Failed to auto-resolve suggestions after manual tagging',
        error: error as Error,
      });
    });
  }

  return {
    message: t({ key: 'tags.transactionsAddedSuccessfully' }),
    addedCount: newTransactionIds.length,
    skippedCount: transactionIds.length - newTransactionIds.length,
  };
});

interface RemoveTransactionsFromTagPayload {
  tagId: number;
  userId: number;
  transactionIds: number[];
}

export const removeTransactionsFromTag = withTransaction(async (payload: RemoveTransactionsFromTagPayload) => {
  const { tagId, userId, transactionIds } = payload;

  await findOrThrowNotFound({
    query: Tags.findOne({ where: { id: tagId, userId } }),
    message: t({ key: 'tags.tagNotFound' }),
  });

  // Verify transactions belong to user
  const transactions = await Transactions.findAll({
    where: {
      id: { [Op.in]: transactionIds },
      userId,
    },
  });

  if (transactions.length !== transactionIds.length) {
    throw new ValidationError({ message: t({ key: 'tags.someTransactionIdsInvalid' }) });
  }

  const deletedCount = await TransactionTags.destroy({
    where: {
      tagId,
      transactionId: { [Op.in]: transactionIds },
    },
  });

  return {
    message: t({ key: 'tags.transactionsRemovedSuccessfully' }),
    removedCount: deletedCount,
  };
});
