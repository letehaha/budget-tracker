import { createController } from '@controllers/helpers/controller-factory';
import { unlinkTransaction } from '@services/payment-reminders/unlink-transaction';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
    periodId: z.string().uuid(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const period = await unlinkTransaction({
    userId: user.id,
    reminderId: params.id,
    periodId: params.periodId,
  });

  return { data: period };
});
