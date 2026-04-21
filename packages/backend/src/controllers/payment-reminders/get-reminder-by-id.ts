import { createController } from '@controllers/helpers/controller-factory';
import { getReminderById } from '@services/payment-reminders/get-reminder-by-id';
import z from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const reminder = await getReminderById({
    userId: user.id,
    id: params.id,
  });

  return { data: reminder };
});
