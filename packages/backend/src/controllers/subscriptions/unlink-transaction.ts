import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { unlinkTransaction } from '@services/subscriptions/unlink-transaction';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
    periodId: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const period = await unlinkTransaction({
    userId: user.id,
    subscriptionId: params.id,
    periodId: params.periodId,
  });

  return { data: period };
});
