import { SUBSCRIPTION_CANDIDATE_STATUS, asCents, toDecimal } from '@bt/shared/types';
import SubscriptionCandidates from '@models/SubscriptionCandidates.model';
import Subscriptions from '@models/Subscriptions.model';

import { isFuzzyNameMatch } from './detect-candidates-utils';

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

  return candidates.map((c) => {
    const json = c.toJSON() as SubscriptionCandidates;

    let possibleMatch: { id: string; name: string } | null = null;
    for (const sub of userSubscriptions) {
      if (isFuzzyNameMatch({ a: json.suggestedName, b: sub.name })) {
        possibleMatch = { id: sub.id, name: sub.name };
        break;
      }
    }

    let isOutdated = false;
    if (json.lastOccurrenceAt && json.medianIntervalDays > 0) {
      const daysSinceLastOccurrence = (Date.now() - new Date(json.lastOccurrenceAt).getTime()) / (1000 * 60 * 60 * 24);
      isOutdated = daysSinceLastOccurrence > json.medianIntervalDays * 2;
    }

    return {
      ...json,
      averageAmount: toDecimal(asCents(json.averageAmount)),
      possibleMatch,
      isOutdated,
    };
  });
}
