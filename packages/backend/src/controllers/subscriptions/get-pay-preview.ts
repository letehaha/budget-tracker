import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getSubscriptionPayPreview } from '@services/subscriptions/get-pay-preview';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const preview = await getSubscriptionPayPreview({
    userId: user.id,
    subscriptionId: params.id,
  });

  return { data: preview };
});
