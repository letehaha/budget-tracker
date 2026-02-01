import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const suggestions = await subscriptionsService.suggestHistoricalMatches({
    subscriptionId: params.id,
    userId: user.id,
  });

  return { data: suggestions };
});
