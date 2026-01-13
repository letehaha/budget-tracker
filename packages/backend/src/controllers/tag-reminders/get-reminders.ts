import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTagReminder, serializeTagReminders } from '@root/serializers';
import * as tagRemindersService from '@services/tag-reminders';
import { z } from 'zod';

export const getRemindersForTag = createController(
  z.object({
    params: z.object({ tagId: recordId() }),
  }),
  async ({ user, params }) => {
    const reminders = await tagRemindersService.getRemindersForTag({
      userId: user.id,
      tagId: params.tagId,
    });
    // Serialize: convert cents to decimal for API response
    return { data: serializeTagReminders(reminders) };
  },
);

export const getReminderById = createController(
  z.object({
    params: z.object({ tagId: recordId(), id: recordId() }),
  }),
  async ({ user, params }) => {
    const reminder = await tagRemindersService.getReminderById({
      id: params.id,
      userId: user.id,
      tagId: params.tagId,
    });
    // Serialize: convert cents to decimal for API response
    return { data: serializeTagReminder(reminder) };
  },
);

export const getAllReminders = createController(z.object({}), async ({ user }) => {
  const reminders = await tagRemindersService.getAllReminders({ userId: user.id });
  // Serialize: convert cents to decimal for API response
  return { data: serializeTagReminders(reminders) };
});
