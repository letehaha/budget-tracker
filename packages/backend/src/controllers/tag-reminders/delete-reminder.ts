import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as tagRemindersService from '@services/tag-reminders';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    tagId: recordId(),
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { id, tagId } = params;

  const data = await tagRemindersService.deleteReminder({
    id,
    userId: user.id,
    tagId,
  });

  return { data };
});
