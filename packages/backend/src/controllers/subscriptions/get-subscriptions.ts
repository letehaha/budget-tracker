import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { booleanQuery, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

const listSchema = z.object({
  query: z.object({
    isActive: booleanQuery().optional(),
    type: z.enum(Object.values(SUBSCRIPTION_TYPES) as [SUBSCRIPTION_TYPES, ...SUBSCRIPTION_TYPES[]]).optional(),
    sortBy: z.enum(['dueDate', 'amount', 'name', 'recent']).optional(),
  }),
});

export const getSubscriptions = createController(listSchema, async ({ user, query }) => {
  const subscriptions = await subscriptionsService.getSubscriptions({
    userId: user.id,
    isActive: query.isActive,
    type: query.type,
    sortBy: query.sortBy,
  });

  return { data: subscriptions };
});

const detailSchema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export const getSubscriptionById = createController(detailSchema, async ({ user, params }) => {
  const subscription = await subscriptionsService.getSubscriptionById({
    id: params.id,
    userId: user.id,
  });

  return { data: subscription };
});
