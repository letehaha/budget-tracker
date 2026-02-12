import { SUBSCRIPTION_CANDIDATE_STATUS } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    status: z
      .enum(
        Object.values(SUBSCRIPTION_CANDIDATE_STATUS) as [
          SUBSCRIPTION_CANDIDATE_STATUS,
          ...SUBSCRIPTION_CANDIDATE_STATUS[],
        ],
      )
      .optional()
      .default(SUBSCRIPTION_CANDIDATE_STATUS.pending),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const candidates = await subscriptionsService.getCandidates({
    userId: user.id,
    status: query.status,
  });

  return { data: candidates };
});
