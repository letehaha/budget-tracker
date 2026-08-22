import { createController } from '@controllers/helpers/controller-factory';
import { deleteAutomation } from '@services/transaction-automations/delete-automation';
import { automationIdParamsSchema } from '@services/transaction-automations/zod-schemas';
import { z } from 'zod';

const schema = z.object({ params: automationIdParamsSchema });

export default createController(schema, async ({ user, params }) => {
  await deleteAutomation({ userId: user.id, id: params.id });
  return {};
});
