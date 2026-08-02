import { SUBSCRIPTION_CANDIDATE_STATUS, SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError } from '@js/errors';
import SubscriptionCandidates from '@models/subscription-candidates.model';
import SubscriptionTransactions from '@models/subscription-transactions.model';
import Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { findSubscriptionOrThrow } from './helpers';

interface ResolveCandidateParams {
  userId: number;
  candidateId: string;
  subscriptionId?: string;
}

/**
 * Shared logic for accepting or linking a candidate:
 * - Find and validate the candidate
 * - Optionally link sample transactions to a subscription
 * - Mark the candidate as accepted
 */
export const resolveCandidate = withTransaction(
  async ({ userId, candidateId, subscriptionId }: ResolveCandidateParams) => {
    const candidate = await findOrThrowNotFound({
      query: SubscriptionCandidates.findOne({
        where: { id: candidateId, userId },
      }),
      message: 'Subscription candidate not found',
    });

    if (candidate.status !== SUBSCRIPTION_CANDIDATE_STATUS.pending) {
      throw new ConflictError({
        message: `Candidate is already ${candidate.status}`,
      });
    }

    if (subscriptionId) {
      const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

      const sampleTxIds = candidate.sampleTransactionIds ?? [];

      if (sampleTxIds.length > 0) {
        // `sampleTransactionIds` is a snapshot taken at detection time. Any of those
        // transactions may have been deleted since (directly, or cascaded from an
        // account delete), so link only the ones that still exist.
        const existing = await Transactions.findAll({
          where: { id: { [Op.in]: sampleTxIds }, userId },
          attributes: ['id'],
          raw: true,
        });
        const existingTxIdSet = new Set(existing.map((tx) => tx.id));
        const existingTxIds = sampleTxIds.filter((id) => existingTxIdSet.has(id));

        const alreadyLinked = await SubscriptionTransactions.findAll({
          where: {
            transactionId: { [Op.in]: sampleTxIds },
            status: SUBSCRIPTION_LINK_STATUS.active,
          },
          attributes: ['transactionId'],
          raw: true,
        });

        const alreadyLinkedSet = new Set(alreadyLinked.map((l) => l.transactionId));
        const newTxIds = existingTxIds.filter((id) => !alreadyLinkedSet.has(id));

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
