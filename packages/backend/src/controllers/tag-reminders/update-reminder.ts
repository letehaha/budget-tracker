import { TAG_REMINDER_FREQUENCIES, TAG_REMINDER_TYPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as tagRemindersService from '@services/tag-reminders';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    tagId: recordId(),
    id: recordId(),
  }),
  body: z.object({
    type: z.enum([TAG_REMINDER_TYPES.amountThreshold, TAG_REMINDER_TYPES.existenceCheck]).optional(),
    frequency: z
      .enum([
        TAG_REMINDER_FREQUENCIES.daily,
        TAG_REMINDER_FREQUENCIES.weekly,
        TAG_REMINDER_FREQUENCIES.monthly,
        TAG_REMINDER_FREQUENCIES.quarterly,
        TAG_REMINDER_FREQUENCIES.yearly,
      ])
      .nullable()
      .optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    settings: z
      .object({
        amountThreshold: z.number().int().min(1).optional(),
      })
      .optional(),
    isEnabled: z.boolean().optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const { id, tagId } = params;
  const { type, frequency, dayOfMonth, settings, isEnabled } = body;

  const data = await tagRemindersService.updateReminder({
    id,
    userId: user.id,
    tagId,
    type,
    frequency,
    dayOfMonth,
    settings,
    isEnabled,
  });

  return { data };
});
