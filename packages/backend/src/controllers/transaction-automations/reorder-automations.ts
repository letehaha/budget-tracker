import { createController } from '@controllers/helpers/controller-factory';
import { reorderAutomations } from '@services/transaction-automations/reorder-automations';
import { reorderAutomationsBodySchema } from '@services/transaction-automations/zod-schemas';
import { z } from 'zod';

const schema = z.object({ body: reorderAutomationsBodySchema });

export default createController(schema, async ({ user, body }) => {
  const data = await reorderAutomations({ userId: user.id, ids: body.ids });
  return { data };
});
