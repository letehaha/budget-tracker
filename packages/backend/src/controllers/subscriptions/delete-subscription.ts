import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  await subscriptionsService.deleteSubscription({
    id: params.id,
    userId: user.id,
  });
});
