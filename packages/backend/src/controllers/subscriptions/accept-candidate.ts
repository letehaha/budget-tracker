import { createController } from '@controllers/helpers/controller-factory';
import { resolveCandidate } from '@services/subscriptions/resolve-candidate';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      subscriptionId: z.string().uuid().optional(),
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
