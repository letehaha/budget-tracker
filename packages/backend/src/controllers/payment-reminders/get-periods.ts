import { createController } from '@controllers/helpers/controller-factory';
import { getPeriods } from '@services/payment-reminders/get-periods';
import z from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z
    .object({
      limit: z.coerce.number().int().positive().max(50).optional(),
      offset: z.coerce.number().int().nonnegative().optional(),
    })
    .optional(),
});

export default createController(schema, async ({ user, params, query }) => {
  const result = await getPeriods({
    userId: user.id,
    reminderId: params.id,
    limit: query?.limit,
    offset: query?.offset,
  });

  return { data: result };
});
