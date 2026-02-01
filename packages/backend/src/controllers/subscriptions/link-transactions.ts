import { SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    transactionIds: z.array(recordId()).min(1),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const result = await subscriptionsService.linkTransactionsToSubscription({
    subscriptionId: params.id,
    transactionIds: body.transactionIds,
    userId: user.id,
    matchSource: SUBSCRIPTION_MATCH_SOURCE.manual,
  });

  return { data: result };
});
