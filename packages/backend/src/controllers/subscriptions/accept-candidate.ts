import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { resolveCandidate } from '@services/subscriptions/resolve-candidate';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z
    .object({
      subscriptionId: recordId().optional(),
    })
    .optional(),
});

export default createController(schema, async ({ user, params, body }) => {
  const result = await resolveCandidate({
    userId: user.id,
    candidateId: params.id,
    subscriptionId: body?.subscriptionId,
  });

  return { data: result };
});
