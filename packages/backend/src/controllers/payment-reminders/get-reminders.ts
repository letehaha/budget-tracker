import { booleanQuery } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getReminders } from '@services/payment-reminders/get-reminders';
import { z } from 'zod';

const schema = z.object({
  query: z
    .object({
      includeInactive: booleanQuery().optional(),
    })
    .optional(),
});

export default createController(schema, async ({ user, query }) => {
  const reminders = await getReminders({
    userId: user.id,
    includeInactive: query?.includeInactive,
  });

  return { data: reminders };
});
