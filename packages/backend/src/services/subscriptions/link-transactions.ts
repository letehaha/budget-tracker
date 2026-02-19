import { CATEGORIZATION_SOURCE, SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import SubscriptionTransactions from '@models/SubscriptionTransactions.model';
import * as Transactions from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

interface LinkTransactionsParams {
  subscriptionId: string;
  transactionIds: number[];
  userId: number;
  matchSource: SUBSCRIPTION_MATCH_SOURCE;
}

export const linkTransactionsToSubscription = withTransaction(
  async ({ subscriptionId, transactionIds, userId, matchSource }: LinkTransactionsParams) => {
    const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

    // Validate all transactions belong to user
    const txs = await Transactions.default.findAll({
      where: { id: { [Op.in]: transactionIds }, userId },
    });

    if (txs.length !== transactionIds.length) {
      throw new NotFoundError({ message: 'One or more transactions not found or do not belong to user.' });
    }

    // Check for existing links (active or previously unlinked)
    const existingLinks = await SubscriptionTransactions.findAll({
      where: { transactionId: { [Op.in]: transactionIds } },
    });

    // Separate into re-linkable (unlinked from THIS subscription) vs truly conflicting
    const reLinkable: SubscriptionTransactions[] = [];
    const conflicting: SubscriptionTransactions[] = [];

    for (const link of existingLinks) {
      if (link.subscriptionId === subscriptionId && link.status === SUBSCRIPTION_LINK_STATUS.unlinked) {
        reLinkable.push(link);
      } else if (link.status === SUBSCRIPTION_LINK_STATUS.active) {
        conflicting.push(link);
      }
    }

    if (conflicting.length > 0) {
      const linkedIds = conflicting.map((l) => l.transactionId);
      throw new ConflictError({
        message: `Transactions already linked to a subscription: ${linkedIds.join(', ')}`,
        details: { transactionIds: linkedIds },
      });
    }

    // Re-link previously unlinked transactions
    const reLinkIds = new Set(reLinkable.map((l) => l.transactionId));
    if (reLinkIds.size > 0) {
      await SubscriptionTransactions.update(
        { status: SUBSCRIPTION_LINK_STATUS.active, matchSource, matchedAt: new Date() },
        {
          where: {
            subscriptionId,
            transactionId: { [Op.in]: [...reLinkIds] },
          },
        },
      );
    }

    // Create new links for transactions that don't have existing rows
    const newTransactionIds = transactionIds.filter((id) => !reLinkIds.has(id));
    if (newTransactionIds.length > 0) {
      const links = newTransactionIds.map((transactionId) => ({
        subscriptionId,
        transactionId,
        matchSource,
      }));

      await SubscriptionTransactions.bulkCreate(links);
    }

    // If rule-matched and subscription has a categoryId, apply category to transactions
    if (matchSource === SUBSCRIPTION_MATCH_SOURCE.rule && subscription.categoryId) {
      await Transactions.default.update(
        {
          categoryId: subscription.categoryId,
          categorizationMeta: {
            source: CATEGORIZATION_SOURCE.subscriptionRule,
            subscriptionId,
            categorizedAt: new Date().toISOString(),
          },
        },
        { where: { id: { [Op.in]: transactionIds } } },
      );
    }

    return { linked: transactionIds.length };
  },
);
