import {
  MAX_REMIND_BEFORE_PRESETS,
  PREFERRED_TIME_SLOTS,
  REMIND_BEFORE_PRESETS,
  RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
} from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateReminder } from '@services/payment-reminders/update-reminder';
import { z } from 'zod';

const remindBeforePresetValues = Object.values(REMIND_BEFORE_PRESETS) as [RemindBeforePreset, ...RemindBeforePreset[]];
const frequencyValues = Object.values(SUBSCRIPTION_FREQUENCIES) as [
  SUBSCRIPTION_FREQUENCIES,
  ...SUBSCRIPTION_FREQUENCIES[],
];

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      name: z.string().min(1).max(200).trim().optional(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
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
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

export default createController(schema, async ({ user, params, body }) => {
  const reminder = await updateReminder({
    userId: user.id,
    id: params.id,
    ...body,
  });

  return { data: reminder };
});
