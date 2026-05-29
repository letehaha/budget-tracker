import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { revertPeriod } from '@services/payment-reminders/revert-period';
import z from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
    periodId: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const period = await revertPeriod({
    userId: user.id,
    reminderId: params.id,
    periodId: params.periodId,
  });

  return { data: period };
});
