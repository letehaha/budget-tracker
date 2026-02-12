import { SUBSCRIPTION_CANDIDATE_STATUS } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import SubscriptionCandidates from '@models/SubscriptionCandidates.model';
import { withTransaction } from '@services/common/with-transaction';

interface DismissCandidateParams {
  userId: number;
  candidateId: string;
}

export const dismissCandidate = withTransaction(async ({ userId, candidateId }: DismissCandidateParams) => {
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

  await candidate.update({
    status: SUBSCRIPTION_CANDIDATE_STATUS.dismissed,
    resolvedAt: new Date(),
  });

  return { id: candidate.id, status: candidate.status };
});
