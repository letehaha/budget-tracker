import {
  PREFERRED_TIME_SLOTS,
  MAX_REMIND_BEFORE_PRESETS,
  REMIND_BEFORE_PRESETS,
  RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
} from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createReminder } from '@services/payment-reminders/create-reminder';
import { z } from 'zod';

const remindBeforePresetValues = Object.values(REMIND_BEFORE_PRESETS) as [RemindBeforePreset, ...RemindBeforePreset[]];
const frequencyValues = Object.values(SUBSCRIPTION_FREQUENCIES) as [
  SUBSCRIPTION_FREQUENCIES,
  ...SUBSCRIPTION_FREQUENCIES[],
];

const schema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(200).trim(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((val) => val >= new Date().toISOString().slice(0, 10), { message: 'Due date cannot be in the past' }),
      subscriptionId: z.string().uuid().optional(),
      expectedAmount: z.number().nonnegative().nullable().optional(),
      currencyCode: z.string().length(3).nullable().optional(),
      frequency: z.enum(frequencyValues).nullable().optional(),
      remindBefore: z.array(z.enum(remindBeforePresetValues)).max(MAX_REMIND_BEFORE_PRESETS).optional(),
      notifyEmail: z.boolean().optional(),
      preferredTime: z
        .number()
        .refine((v) => (PREFERRED_TIME_SLOTS as readonly number[]).includes(v), {
          message: 'preferredTime must be one of: 0, 4, 8, 12, 16, 20',
        })
        .optional(),
      timezone: z.string().max(50).optional(),
      categoryId: recordId().nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
    })
    .superRefine((data, ctx) => {
      const hasAmount = data.expectedAmount != null;
      const hasCurrency = data.currencyCode != null;

      if (hasAmount !== hasCurrency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Both expectedAmount and currencyCode must be provided together.',
          path: [hasAmount ? 'currencyCode' : 'expectedAmount'],
        });
      }
    }),
});

export default createController(schema, async ({ user, body }) => {
  const reminder = await createReminder({
    userId: user.id,
    ...body,
  });

  return { data: reminder, statusCode: 201 };
});
