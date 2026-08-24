import { createController } from '@controllers/helpers/controller-factory';
import { previewAutomation } from '@services/transaction-automations/preview';
import { previewAutomationBodySchema } from '@services/transaction-automations/zod-schemas';
import { z } from 'zod';

const schema = z.object({ body: previewAutomationBodySchema });

export default createController(schema, async ({ user, body }) => {
  const data = await previewAutomation({ userId: user.id, conditions: body.conditions });
  return { data };
});
