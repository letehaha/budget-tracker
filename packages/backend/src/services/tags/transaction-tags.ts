import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Tags from '@models/Tags.model';
import TransactionTags from '@models/TransactionTags.model';
import Transactions from '@models/Transactions.model';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

export interface AddTransactionsToTagPayload {
  tagId: number;
  userId: number;
  transactionIds: number[];
}

export const addTransactionsToTag = withTransaction(async (payload: AddTransactionsToTagPayload) => {
  const { tagId, userId, transactionIds } = payload;

  const tag = await Tags.findOne({
    where: { id: tagId, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

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
  }

  return {
    message: t({ key: 'tags.transactionsAddedSuccessfully' }),
    addedCount: newTransactionIds.length,
    skippedCount: transactionIds.length - newTransactionIds.length,
  };
});

export interface RemoveTransactionsFromTagPayload {
  tagId: number;
  userId: number;
  transactionIds: number[];
}

export const removeTransactionsFromTag = withTransaction(async (payload: RemoveTransactionsFromTagPayload) => {
  const { tagId, userId, transactionIds } = payload;

  const tag = await Tags.findOne({
    where: { id: tagId, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

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

export interface GetTagsForTransactionPayload {
  transactionId: number;
  userId: number;
}

export const getTagsForTransaction = async ({ transactionId, userId }: GetTagsForTransactionPayload) => {
  const transaction = await Transactions.findOne({
    where: { id: transactionId, userId },
    include: [
      {
        model: Tags,
        through: { attributes: [] },
      },
    ],
  });

  if (!transaction) {
    throw new NotFoundError({ message: t({ key: 'transactions.transactionNotFound' }) });
  }

  return transaction.tags || [];
};

export interface GetTransactionsForTagPayload {
  tagId: number;
  userId: number;
  limit?: number;
  offset?: number;
}

export const getTransactionsForTag = async ({
  tagId,
  userId,
  limit = 50,
  offset = 0,
}: GetTransactionsForTagPayload) => {
  const tag = await Tags.findOne({
    where: { id: tagId, userId },
  });

  if (!tag) {
    throw new NotFoundError({ message: t({ key: 'tags.tagNotFound' }) });
  }

  const transactions = await Transactions.findAll({
    include: [
      {
        model: Tags,
        where: { id: tagId },
        through: { attributes: [] },
        attributes: [],
      },
    ],
    where: { userId },
    limit,
    offset,
    order: [['time', 'DESC']],
  });

  return transactions;
};
