import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(20).default(5),
    type: z.enum(Object.values(SUBSCRIPTION_TYPES) as [SUBSCRIPTION_TYPES, ...SUBSCRIPTION_TYPES[]]).optional(),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const data = await subscriptionsService.getUpcomingPayments({
    userId: user.id,
    limit: query.limit,
    type: query.type,
  });

  return { data };
});
