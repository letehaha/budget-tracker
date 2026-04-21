import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { markPeriodPaid } from '@services/payment-reminders/mark-period-paid';
import z from 'zod';

const schema = z.object({
  params: z.object({
    id: z.string().uuid(),
    periodId: z.string().uuid(),
  }),
  body: z
    .object({
      transactionId: recordId().nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
    })
    .optional(),
});

export default createController(schema, async ({ user, params, body }) => {
  const period = await markPeriodPaid({
    userId: user.id,
    reminderId: params.id,
    periodId: params.periodId,
    transactionId: body?.transactionId,
    notes: body?.notes,
  });

  return { data: period };
});
