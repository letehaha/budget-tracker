import { TAG_SUGGESTION_SOURCE } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import TagSuggestionDismissals from '@models/tag-suggestion-dismissals.model';
import TagSuggestions from '@models/tag-suggestions.model';
import Tags from '@models/tags.model';
import TransactionTags from '@models/transaction-tags.model';
import Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

interface GetSuggestionsParams {
  userId: number;
  limit?: number;
  offset?: number;
}

export const getSuggestions = async ({ userId, limit = 50, offset = 0 }: GetSuggestionsParams) => {
  const suggestions = await TagSuggestions.findAll({
    where: { userId },
    include: [
      {
        model: Transactions,
        as: 'transaction',
        attributes: ['id', 'note', 'amount', 'time', 'accountId', 'currencyCode', 'transactionType'],
      },
      {
        model: Tags,
        as: 'tag',
        attributes: ['id', 'name', 'color', 'icon'],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  // Group by transaction
  const groupedMap = new Map<
    number,
    {
      transaction: Transactions;
      suggestions: Array<{
        tagId: number;
        tag: Tags;
        source: TAG_SUGGESTION_SOURCE;
        ruleId: string | null;
        createdAt: Date;
      }>;
    }
  >();

  for (const suggestion of suggestions) {
    const txId = suggestion.transactionId;

    if (!groupedMap.has(txId)) {
      groupedMap.set(txId, {
        transaction: suggestion.transaction,
        suggestions: [],
      });
    }

    groupedMap.get(txId)!.suggestions.push({
      tagId: suggestion.tagId,
      tag: suggestion.tag,
      source: suggestion.source,
      ruleId: suggestion.ruleId,
      createdAt: suggestion.createdAt,
    });
  }

  return Array.from(groupedMap.values());
};

interface GetSuggestionsCountParams {
  userId: number;
}

export const getSuggestionsCount = async ({ userId }: GetSuggestionsCountParams) => {
  return TagSuggestions.count({ where: { userId } });
};

interface ApproveSuggestionParams {
  userId: number;
  transactionId: number;
  tagId: number;
}

export const approveSuggestion = withTransaction(async ({ userId, transactionId, tagId }: ApproveSuggestionParams) => {
  const suggestion = await TagSuggestions.findOne({
    where: { userId, transactionId, tagId },
  });

  if (!suggestion) {
    throw new NotFoundError({ message: 'Suggestion not found' });
  }

  // Apply the tag to the transaction
  await TransactionTags.findOrCreate({
    where: { tagId, transactionId },
  });

  // Remove the suggestion
  await suggestion.destroy();
});

interface RejectSuggestionParams {
  userId: number;
  transactionId: number;
  tagId: number;
}

export const rejectSuggestion = withTransaction(async ({ userId, transactionId, tagId }: RejectSuggestionParams) => {
  const suggestion = await TagSuggestions.findOne({
    where: { userId, transactionId, tagId },
  });

  if (!suggestion) {
    throw new NotFoundError({ message: 'Suggestion not found' });
  }

  // Create dismissal to prevent re-suggesting
  await TagSuggestionDismissals.findOrCreate({
    where: { userId, transactionId, tagId },
  });

  // Remove the suggestion
  await suggestion.destroy();
});

interface BulkActionParams {
  userId: number;
  items: Array<{ transactionId: number; tagId: number }>;
}

export const bulkApprove = withTransaction(async ({ userId, items }: BulkActionParams) => {
  let approvedCount = 0;

  for (const { transactionId, tagId } of items) {
    const suggestion = await TagSuggestions.findOne({
      where: { userId, transactionId, tagId },
    });

    if (!suggestion) continue;

    await TransactionTags.findOrCreate({
      where: { tagId, transactionId },
    });

    await suggestion.destroy();
    approvedCount++;
  }

  return { approvedCount, skippedCount: items.length - approvedCount };
});

export const bulkReject = withTransaction(async ({ userId, items }: BulkActionParams) => {
  let rejectedCount = 0;

  for (const { transactionId, tagId } of items) {
    const suggestion = await TagSuggestions.findOne({
      where: { userId, transactionId, tagId },
    });

    if (!suggestion) continue;

    await TagSuggestionDismissals.findOrCreate({
      where: { userId, transactionId, tagId },
    });

    await suggestion.destroy();
    rejectedCount++;
  }

  return { rejectedCount, skippedCount: items.length - rejectedCount };
});

/**
 * Auto-resolve suggestions when a user manually tags a transaction with the same tag.
 * Called from the addTransactionsToTag service.
 */
export const autoResolveSuggestions = async ({
  userId,
  transactionIds,
  tagId,
}: {
  userId: number;
  transactionIds: number[];
  tagId: number;
}) => {
  await TagSuggestions.destroy({
    where: {
      userId,
      transactionId: { [Op.in]: transactionIds },
      tagId,
    },
  });
};
