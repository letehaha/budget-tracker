import { SUBSCRIPTION_CANDIDATE_STATUS, SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import SubscriptionCandidates from '@models/SubscriptionCandidates.model';
import SubscriptionTransactions from '@models/SubscriptionTransactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

interface AcceptCandidateParams {
  userId: number;
  candidateId: string;
  subscriptionId?: string;
}

export const acceptCandidate = withTransaction(
  async ({ userId, candidateId, subscriptionId }: AcceptCandidateParams) => {
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

    // If a subscriptionId is provided, link the candidate's sample transactions
    if (subscriptionId) {
      const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

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
    }

    await candidate.update({
      status: SUBSCRIPTION_CANDIDATE_STATUS.accepted,
      ...(subscriptionId && { subscriptionId }),
      resolvedAt: new Date(),
    });

    return { id: candidate.id, status: candidate.status };
  },
);
