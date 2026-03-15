import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

import { matchingRuleSchema } from './shared-schemas';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      name: z.string().min(1).max(200).trim().optional(),
      type: z.enum(Object.values(SUBSCRIPTION_TYPES) as [SUBSCRIPTION_TYPES, ...SUBSCRIPTION_TYPES[]]).optional(),
      expectedAmount: z.number().int().nonnegative().nullable().optional(),
      expectedCurrencyCode: z.string().length(3).nullable().optional(),
      frequency: z
        .enum(Object.values(SUBSCRIPTION_FREQUENCIES) as [SUBSCRIPTION_FREQUENCIES, ...SUBSCRIPTION_FREQUENCIES[]])
        .optional(),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      accountId: recordId().nullable().optional(),
      categoryId: recordId().nullable().optional(),
      matchingRules: z.object({ rules: z.array(matchingRuleSchema) }).optional(),
      isActive: z.boolean().optional(),
      notes: z.string().max(5000).nullable().optional(),
    })
    .superRefine((data, ctx) => {
      // When both are explicitly provided in the same update, they must be consistent
      const hasAmount = data.expectedAmount !== undefined ? data.expectedAmount != null : undefined;
      const hasCurrency = data.expectedCurrencyCode !== undefined ? data.expectedCurrencyCode != null : undefined;

      if (hasAmount !== undefined && hasCurrency !== undefined && hasAmount !== hasCurrency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Both expectedAmount and expectedCurrencyCode must be provided together.',
          path: [hasAmount ? 'expectedCurrencyCode' : 'expectedAmount'],
        });
      }
    }),
});

export default createController(schema, async ({ user, params, body }) => {
  const subscription = await subscriptionsService.updateSubscription({
    id: params.id,
    userId: user.id,
    ...body,
  });

  return { data: subscription };
});
