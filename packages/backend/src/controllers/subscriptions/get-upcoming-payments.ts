import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(20).default(5),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const data = await subscriptionsService.getUpcomingPayments({
    userId: user.id,
    limit: query.limit,
  });

  return { data };
});
