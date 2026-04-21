import { createController } from '@controllers/helpers/controller-factory';
import { deleteReminder } from '@services/payment-reminders/delete-reminder';
import z from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const result = await deleteReminder({
    userId: user.id,
    id: params.id,
  });

  return { data: result };
});
