import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { skipPeriod } from '@services/payment-reminders/skip-period';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
    periodId: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const period = await skipPeriod({
    userId: user.id,
    reminderId: params.id,
    periodId: params.periodId,
  });

  return { data: period };
});
