import { SUBSCRIPTION_CANDIDATE_STATUS } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError } from '@js/errors';
import SubscriptionCandidates from '@models/subscription-candidates.model';
import { withTransaction } from '@services/common/with-transaction';

interface DismissCandidateParams {
  userId: number;
  candidateId: string;
}

export const dismissCandidate = withTransaction(async ({ userId, candidateId }: DismissCandidateParams) => {
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

  await candidate.update({
    status: SUBSCRIPTION_CANDIDATE_STATUS.dismissed,
    resolvedAt: new Date(),
  });

  return { id: candidate.id, status: candidate.status };
});
