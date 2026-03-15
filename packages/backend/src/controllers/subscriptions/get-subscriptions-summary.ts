import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    type: z.enum(Object.values(SUBSCRIPTION_TYPES) as [SUBSCRIPTION_TYPES, ...SUBSCRIPTION_TYPES[]]).optional(),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const summary = await subscriptionsService.getSubscriptionsSummary({
    userId: user.id,
    type: query.type,
  });

  return { data: summary };
});
