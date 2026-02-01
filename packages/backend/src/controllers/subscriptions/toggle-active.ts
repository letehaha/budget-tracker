import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    isActive: z.boolean(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const subscription = await subscriptionsService.toggleSubscriptionActive({
    id: params.id,
    userId: user.id,
    isActive: body.isActive,
  });

  return { data: subscription };
});
