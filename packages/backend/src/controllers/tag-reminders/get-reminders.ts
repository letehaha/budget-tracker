import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as tagRemindersService from '@services/tag-reminders';
import { z } from 'zod';

export const getRemindersForTag = createController(
  z.object({
    params: z.object({ tagId: recordId() }),
  }),
  async ({ user, params }) => {
    const data = await tagRemindersService.getRemindersForTag({
      userId: user.id,
      tagId: params.tagId,
    });
    return { data };
  },
);

export const getReminderById = createController(
  z.object({
    params: z.object({ tagId: recordId(), id: recordId() }),
  }),
  async ({ user, params }) => {
    const data = await tagRemindersService.getReminderById({
      id: params.id,
      userId: user.id,
      tagId: params.tagId,
    });
    return { data };
  },
);

export const getAllReminders = createController(z.object({}), async ({ user }) => {
  const data = await tagRemindersService.getAllReminders({ userId: user.id });
  return { data };
});
