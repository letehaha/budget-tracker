import { createController } from '@controllers/helpers/controller-factory';
import { updateAutomation } from '@services/transaction-automations/update-automation';
import { automationIdParamsSchema, updateAutomationBodySchema } from '@services/transaction-automations/zod-schemas';
import { z } from 'zod';

const schema = z.object({ params: automationIdParamsSchema, body: updateAutomationBodySchema });

export default createController(schema, async ({ user, params, body }) => {
  const data = await updateAutomation({ userId: user.id, id: params.id, ...body });
  return { data };
});
