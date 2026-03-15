import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

import { matchingRuleSchema } from './shared-schemas';

const schema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(200).trim(),
      type: z
        .enum(Object.values(SUBSCRIPTION_TYPES) as [SUBSCRIPTION_TYPES, ...SUBSCRIPTION_TYPES[]])
        .optional()
        .default(SUBSCRIPTION_TYPES.subscription),
      expectedAmount: z.number().int().nonnegative().nullable().optional(),
      expectedCurrencyCode: z.string().length(3).nullable().optional(),
      frequency: z.enum(
        Object.values(SUBSCRIPTION_FREQUENCIES) as [SUBSCRIPTION_FREQUENCIES, ...SUBSCRIPTION_FREQUENCIES[]],
      ),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      accountId: recordId().nullable().optional(),
      categoryId: recordId().nullable().optional(),
      matchingRules: z
        .object({ rules: z.array(matchingRuleSchema) })
        .optional()
        .default({ rules: [] }),
      notes: z.string().max(5000).nullable().optional(),
    })
    .superRefine((data, ctx) => {
      const hasAmount = data.expectedAmount != null;
      const hasCurrency = data.expectedCurrencyCode != null;

      if (hasAmount !== hasCurrency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Both expectedAmount and expectedCurrencyCode must be provided together.',
          path: [hasAmount ? 'expectedCurrencyCode' : 'expectedAmount'],
        });
      }

      if (data.type === SUBSCRIPTION_TYPES.subscription && !hasAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Subscriptions require expectedAmount and expectedCurrencyCode.',
          path: ['expectedAmount'],
        });
      }
    }),
});

export default createController(schema, async ({ user, body }) => {
  const subscription = await subscriptionsService.createSubscription({
    userId: user.id,
    ...body,
  });

  return { data: subscription, statusCode: 201 };
});
