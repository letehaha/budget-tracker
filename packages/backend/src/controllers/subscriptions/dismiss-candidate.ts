import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const result = await subscriptionsService.dismissCandidate({
    userId: user.id,
    candidateId: params.id,
  });

  return { data: result };
});
