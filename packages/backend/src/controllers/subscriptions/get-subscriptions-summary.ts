import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { INCOME_LOOKBACK_MONTHS_OPTIONS } from '@services/subscriptions/get-subscriptions-summary';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    type: z.enum(Object.values(SUBSCRIPTION_TYPES) as [SUBSCRIPTION_TYPES, ...SUBSCRIPTION_TYPES[]]).optional(),
    lookbackMonths: z.coerce
      .number()
      .int()
      .refine((v) => (INCOME_LOOKBACK_MONTHS_OPTIONS as readonly number[]).includes(v), {
        message: `lookbackMonths must be one of ${INCOME_LOOKBACK_MONTHS_OPTIONS.join(', ')}`,
      })
      .optional(),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const summary = await subscriptionsService.getSubscriptionsSummary({
    userId: user.id,
    type: query.type,
    lookbackMonths: query.lookbackMonths as (typeof INCOME_LOOKBACK_MONTHS_OPTIONS)[number] | undefined,
  });

  return { data: summary };
});
