import { SUBSCRIPTION_CANDIDATE_STATUS } from '@bt/shared/types';
import SubscriptionCandidates from '@models/SubscriptionCandidates.model';
import Subscriptions from '@models/Subscriptions.model';

import { serializeCandidate } from './serialize-candidate';

interface GetCandidatesParams {
  userId: number;
  status?: SUBSCRIPTION_CANDIDATE_STATUS;
}

export async function getCandidates({ userId, status }: GetCandidatesParams) {
  const where: Record<string, unknown> = { userId };
  if (status) {
    where.status = status;
  }

  const [candidates, userSubscriptions] = await Promise.all([
    SubscriptionCandidates.findAll({
      where,
      order: [['confidenceScore', 'DESC']],
    }),
    Subscriptions.findAll({
      where: { userId },
      attributes: ['id', 'name'],
      raw: true,
    }),
  ]);

  return candidates.map((c) => serializeCandidate({ candidate: c, userSubscriptions }));
}
