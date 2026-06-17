import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getReminderPayPreview } from '@services/payment-reminders/get-pay-preview';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const preview = await getReminderPayPreview({
    userId: user.id,
    reminderId: params.id,
  });

  return { data: preview };
});
