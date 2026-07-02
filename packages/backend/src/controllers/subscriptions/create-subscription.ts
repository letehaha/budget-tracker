import {
  MAX_REMIND_BEFORE_PRESETS,
  REMIND_BEFORE_PRESETS,
  RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_TYPES,
} from '@bt/shared/types';
import { currencyCode, recordId } from '@common/lib/zod/custom-types';
import { logoDomainSchema } from '@controllers/common/logo-domain.schema';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import * as subscriptionsService from '@services/subscriptions';
import { z } from 'zod';

import { matchingRuleSchema } from './shared-schemas';

const remindBeforePresetValues = Object.values(REMIND_BEFORE_PRESETS) as [RemindBeforePreset, ...RemindBeforePreset[]];

const schema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(200).trim(),
      type: z
        .enum(Object.values(SUBSCRIPTION_TYPES) as [SUBSCRIPTION_TYPES, ...SUBSCRIPTION_TYPES[]])
        .optional()
        .default(SUBSCRIPTION_TYPES.subscription),
      // Decimal amount (e.g. 9.99). Stored as cents internally by the service.
      expectedAmount: z.number().nonnegative().nullable().optional(),
      expectedCurrencyCode: currencyCode().nullable().optional(),
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
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      maxOccurrences: z.number().int().positive().nullable().optional(),
      remindBefore: z.array(z.enum(remindBeforePresetValues)).max(MAX_REMIND_BEFORE_PRESETS).optional(),
      notifyEmail: z.boolean().optional(),
      autoRecord: z.boolean().optional(),
      // Present key (even null) → manual override on the new subscription; absent
      // key → leave the logo unset so the background resolver auto-resolves it.
      logoDomain: logoDomainSchema.optional(),
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

      // An installment is a finite plan: it needs a payment count and a schedule
      // to track progress against. Amount stays optional (supports variable plans).
      if (data.type === SUBSCRIPTION_TYPES.installment) {
        if (data.maxOccurrences == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Installments require maxOccurrences (the number of payments).',
            path: ['maxOccurrences'],
          });
        }
        if (data.dueDate == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Installments require a payment schedule date (dueDate).',
            path: ['dueDate'],
          });
        }
      }

      // Auto-record books a transaction every cycle, so it needs the booking
      // inputs and conflicts with matching rules (both would settle the same
      // period — auto-record on dueDate, matching on the next bank import).
      if (data.autoRecord) {
        if (data.accountId == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t({ key: 'subscriptions.validation.autoRecord.requiresAccountField' }),
            path: ['accountId'],
          });
        }
        if (data.expectedAmount == null || data.expectedCurrencyCode == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t({ key: 'subscriptions.validation.autoRecord.requiresAmountField' }),
            path: ['expectedAmount'],
          });
        }
        if (data.matchingRules && data.matchingRules.rules.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t({ key: 'subscriptions.validation.autoRecord.excludesMatchingField' }),
            path: ['matchingRules'],
          });
        }
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
