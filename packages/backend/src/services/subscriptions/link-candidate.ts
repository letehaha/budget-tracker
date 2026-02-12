import { SUBSCRIPTION_CANDIDATE_STATUS, SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import SubscriptionCandidates from '@models/SubscriptionCandidates.model';
import SubscriptionTransactions from '@models/SubscriptionTransactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

interface LinkCandidateParams {
  userId: number;
  candidateId: string;
  subscriptionId: string;
}

export const linkCandidateToSubscription = withTransaction(
  async ({ userId, candidateId, subscriptionId }: LinkCandidateParams) => {
    const candidate = await SubscriptionCandidates.findOne({
      where: { id: candidateId, userId },
    });

    if (!candidate) {
      throw new NotFoundError({ message: 'Subscription candidate not found' });
    }

    if (candidate.status !== SUBSCRIPTION_CANDIDATE_STATUS.pending) {
      throw new ConflictError({
        message: `Candidate is already ${candidate.status}`,
      });
    }

    // Verify subscription exists and belongs to user
    const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

    // Link sample transactions that aren't already linked to any subscription
    const sampleTxIds = candidate.sampleTransactionIds ?? [];

    if (sampleTxIds.length > 0) {
      const alreadyLinked = await SubscriptionTransactions.findAll({
        where: {
          transactionId: { [Op.in]: sampleTxIds },
          status: SUBSCRIPTION_LINK_STATUS.active,
        },
        attributes: ['transactionId'],
        raw: true,
      });

      const alreadyLinkedSet = new Set(alreadyLinked.map((l) => l.transactionId));
      const newTxIds = sampleTxIds.filter((id) => !alreadyLinkedSet.has(id));

      if (newTxIds.length > 0) {
        await SubscriptionTransactions.bulkCreate(
          newTxIds.map((transactionId) => ({
            subscriptionId: subscription.id,
            transactionId,
            matchSource: SUBSCRIPTION_MATCH_SOURCE.manual,
          })),
        );
      }
    }

    // Mark candidate as accepted with subscription reference
    await candidate.update({
      status: SUBSCRIPTION_CANDIDATE_STATUS.accepted,
      subscriptionId: subscription.id,
      resolvedAt: new Date(),
    });

    return { id: candidate.id, status: candidate.status };
  },
);
